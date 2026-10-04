"""Project documents and owner-managed collaboration."""
from uuid import UUID, uuid4
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Project, ProjectDocument, ProjectMember, UploadedFile, User
from app.utils.auth import get_current_user
from app.services.project_service import require_project, accessible_projects, project_role

router = APIRouter()


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    file_ids: list[int] = Field(default_factory=list, max_length=50)


@router.get("")
def list_projects(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    projects = accessible_projects(db, user_id).order_by(Project.created_at).all()
    return {"projects": [{"id": p.id, "name": p.name, "role": project_role(db, p, user_id)} for p in projects]}


@router.post("", status_code=201)
def create_project(body: ProjectCreate, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = set(body.file_ids)
    owned = {f.id for f in db.query(UploadedFile).filter(UploadedFile.owner_id == user_id, UploadedFile.id.in_(ids)).all()}
    if ids != owned:
        raise HTTPException(404, "Document introuvable.")
    project = Project(id=str(uuid4()), name=body.name, owner_id=user_id)
    db.add(project)
    db.flush()
    db.add_all([ProjectDocument(project_id=project.id, file_id=f) for f in ids])
    db.commit()
    return {"id": project.id, "name": project.name, "role": "owner"}


@router.get("/{project_id}/documents")
def project_documents(project_id: UUID, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    require_project(db, project_id, user_id)
    files = db.query(UploadedFile).join(ProjectDocument, ProjectDocument.file_id == UploadedFile.id).filter(
        ProjectDocument.project_id == str(project_id)).all()
    return {"files": [{"id": f.id, "file_name": f.file_name, "processed": bool(f.embedding_path),
                       "processing_status": f.processing_status} for f in files]}


@router.put("/{project_id}/documents/{file_id}")
def attach_document(project_id: UUID, file_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    # Serialize attachment requests so retries remain idempotent.
    project = require_project(db, project_id, user_id, "contribute")
    db.query(Project).filter(Project.id == project.id).with_for_update().first()
    require_project(db, project_id, user_id, "contribute")
    if project is None:
        raise HTTPException(404, "Projet introuvable.")
    if not db.query(UploadedFile).filter(UploadedFile.id == file_id, UploadedFile.owner_id == user_id).first():
        raise HTTPException(404, "Document introuvable.")
    if not db.get(ProjectDocument, (str(project_id), file_id)):
        db.add(ProjectDocument(project_id=str(project_id), file_id=file_id))
    db.commit()
    return {"attached": True}


class MemberInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    user_name: str = Field(min_length=1, max_length=200)
    role: Literal['admin', 'contributor', 'reader']


@router.get('/{project_id}/members')
def members(project_id: UUID, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    project = require_project(db, project_id, user_id)
    owner = db.get(User, project.owner_id)
    rows = db.query(ProjectMember, User).join(User, User.id == ProjectMember.user_id).filter(ProjectMember.project_id == str(project_id)).all()
    return {'members': [{'user_id': owner.id, 'user_name': owner.user_name, 'role': 'owner'}] + [
        {'user_id': u.id, 'user_name': u.user_name, 'role': m.role} for m, u in rows]}


@router.put('/{project_id}/members')
def set_member(project_id: UUID, body: MemberInput, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    project = require_project(db, project_id, user_id, 'manage_members')
    db.query(Project).filter(Project.id == project.id).with_for_update().first()
    target = db.query(User).filter(User.user_name == body.user_name).first()
    if target is None:
        raise HTTPException(404, 'Compte introuvable. Utilisez son identifiant exact.')
    if target.id == project.owner_id:
        raise HTTPException(409, 'Le rôle du propriétaire ne peut pas être modifié.')
    member = db.get(ProjectMember, (project.id, target.id))
    if member:
        member.role = body.role
    else:
        db.add(ProjectMember(project_id=project.id, user_id=target.id, role=body.role))
    db.commit()
    return {'user_id': target.id, 'user_name': target.user_name, 'role': body.role}


@router.delete('/{project_id}/members/{target_id}')
def remove_member(project_id: UUID, target_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    project = require_project(db, project_id, user_id, 'manage_members')
    db.query(Project).filter(Project.id == project.id).with_for_update().first()
    if target_id == project.owner_id:
        raise HTTPException(409, 'Le propriétaire ne peut pas être retiré.')
    member = db.get(ProjectMember, (project.id, target_id))
    if member:
        db.delete(member)
    db.commit()
    return {'removed': True}
