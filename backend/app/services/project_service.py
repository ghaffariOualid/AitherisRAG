"""Project permissions independent of vector storage ownership."""
from fastapi import HTTPException
from sqlalchemy import or_
from app.db.models import Project, ProjectMember, ProjectDocument


PERMISSIONS = {
    'read': {'owner', 'admin', 'contributor', 'reader'},
    'contribute': {'owner', 'admin', 'contributor'},
    'review': {'owner', 'admin'},
    'manage_members': {'owner'},
}


def accessible_projects(db, user_id):
    membership = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user_id)
    return db.query(Project).filter(or_(Project.owner_id == user_id, Project.id.in_(membership)))


def project_role(db, project, user_id):
    if project.owner_id == user_id:
        return 'owner'
    member = db.query(ProjectMember).filter(ProjectMember.project_id == project.id,
        ProjectMember.user_id == user_id).populate_existing().first()
    return member.role if member else None


def require_project(db, project_id, user_id, action='read'):
    project = db.query(Project).filter(Project.id == str(project_id)).populate_existing().first()
    role = project_role(db, project, user_id) if project else None
    if role is None:
        raise HTTPException(404, 'Projet introuvable.')
    if role not in PERMISSIONS[action]:
        raise HTTPException(403, 'Votre rôle ne permet pas cette action.')
    return project


def require_project_documents(db, project_id, user_id, file_ids):
    require_project(db, project_id, user_id)
    attached = {row.file_id for row in db.query(ProjectDocument).filter(
        ProjectDocument.project_id == str(project_id), ProjectDocument.file_id.in_(file_ids)).all()}
    if attached != set(file_ids):
        raise HTTPException(409, "Un document ne fait plus partie de ce projet.")
