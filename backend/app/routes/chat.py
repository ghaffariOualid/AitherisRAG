from fastapi import APIRouter, Depends, HTTPException, Body, Request, Query, UploadFile, File, Form
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc, func
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.db.models import Chat, UploadedFile, DocumentConversation, GeneralConversation, GeneralChatMessage
from app.utils.auth import get_current_user
from app.db.database import get_db
from app.services.chat_service import process_chat_request, process_general_chat
from app.services.quota_service import enforce_chat_quota
from app.middleware.error_handler import ValidationException, DatabaseException, FileProcessingException
from app.middleware.error_handler import get_request_id
from app.middleware.error_handler import ValidationException, DatabaseException, FileProcessingException
from app.middleware.error_handler import get_request_id
from app.utils.logger import log_info, log_error, log_warning
from app.services.transcription_service import transcription_service
import time

router = APIRouter()


@router.post("/transcribe")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    user_id: int = Depends(get_current_user),
):
    """
    Transcribe recorded audio file to text using Whisper.
    """
    request_id = get_request_id(request)
    try:
        content = await file.read()
    except Exception as e:
        log_error(e, context="chat_transcribe", request_id=request_id)
        raise HTTPException(status_code=400, detail="Impossible de lire le fichier audio.")

    if not content or len(content) < 100:
        raise HTTPException(status_code=400, detail="Fichier audio vide ou trop court.")

    filename = file.filename or "audio.webm"

    try:
        result = transcription_service.transcribe(
            audio_bytes=content,
            filename=filename,
            language=language
        )
        return {
            "status": "success",
            "text": result.get("text", ""),
            "duration": result.get("duration", 0),
            "provider": result.get("provider", "groq"),
            "model": result.get("model", "whisper-large-v3-turbo")
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        log_error(e, context="chat_transcribe", request_id=request_id, filename=filename)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la transcription audio: {str(e)}"
        )


@router.post("/general")
async def general_chat(
    request: Request,
    question: str = Body(...),
    excluded_file_ids: Optional[List[int]] = Body(default=None),
    conversation_id: Optional[int] = Body(default=None),
    model: str = Body(default="Mistral"),
    language: str = Body(default="Auto-detect"),
    skill_slug: Optional[str] = Body(default=None),
    skill_id: Optional[int] = Body(default=None),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(enforce_chat_quota),
):
    """
    General chat endpoint that uses all user documents by default.
    Users can optionally exclude specific documents from the context.
    
    Args:
        question: The user's question
        excluded_file_ids: Optional list of file IDs to exclude from context
        model: The AI model to use
        language: Response language preference
        skill_slug: Optional skill slug to guide AI persona
        skill_id: Optional skill ID
    """
    request_id = get_request_id(request)
    try:
        return await process_general_chat(
            question=question,
            excluded_file_ids=excluded_file_ids or [],
            user_id=user_id,
            db=db,
            language=language,
            request_id=request_id,
            conversation_id=conversation_id,
            skill_slug=skill_slug,
            skill_id=skill_id,
        )
    except (ValidationException, FileProcessingException, DatabaseException):
        raise
    except Exception as e:
        log_error(e, context="general_chat", request_id=request_id, user_id=user_id)
        raise DatabaseException("Unable to process the chat request", {"request_id": request_id})


def serialize_general_message(message: GeneralChatMessage) -> Dict[str, Any]:
    return {
        "id": message.id,
        "message": message.content,
        "is_user_message": message.role == "user",
        "create_at": message.created_at.isoformat(),
        "documents_used": message.sources or [],
    }


def serialize_document_conversation(conversation: DocumentConversation) -> Dict[str, Any]:
    return {
        "id": conversation.id,
        "file_id": conversation.uploaded_file_id,
        "title": conversation.title,
        "skill_id": conversation.skill_id,
        "skill_slug": conversation.skill_slug,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
    }


def serialize_document_messages(chats: List[Chat]) -> List[Dict[str, Any]]:
    messages = []
    for chat in chats:
        if chat.question and chat.response:
            question_first = chat.created_at_response is None or (
                chat.created_at_question is not None
                and chat.created_at_question <= chat.created_at_response
            )
            ordered_messages = (
                [("question", chat.question, True, chat.created_at_question), ("response", chat.response, False, chat.created_at_response)]
                if question_first
                else [("response", chat.response, False, chat.created_at_response), ("question", chat.question, True, chat.created_at_question)]
            )
            for message_type, content, is_user_message, created_at in ordered_messages:
                messages.append({
                    "id": f"{chat.id}-{message_type}",
                    "message": content,
                    "is_user_message": is_user_message,
                    "create_at": created_at,
                })
        elif chat.response:
            messages.append({
                "id": f"{chat.id}-response",
                "message": chat.response,
                "is_user_message": False,
                "create_at": chat.created_at_response,
            })
    return messages


def get_owned_file_or_404(file_id: int, user_id: int, db: Session) -> UploadedFile:
    file = db.query(UploadedFile).filter(
        UploadedFile.owner_id == user_id,
        UploadedFile.id == file_id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file


def delete_empty_document_conversations(file_id: int, user_id: int, db: Session) -> None:
    empty_conversation_ids = db.query(DocumentConversation.id).outerjoin(
        Chat,
        Chat.document_conversation_id == DocumentConversation.id,
    ).filter(
        DocumentConversation.owner_id == user_id,
        DocumentConversation.uploaded_file_id == file_id,
    ).group_by(DocumentConversation.id).having(
        func.count(Chat.id) == 0
    ).subquery()
    db.query(DocumentConversation).filter(
        DocumentConversation.id.in_(empty_conversation_ids)
    ).delete(synchronize_session=False)
    db.commit()


@router.get("/documents/{file_id}/conversations")
async def list_document_conversations(
    file_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_file_or_404(file_id, user_id, db)
    delete_empty_document_conversations(file_id, user_id, db)
    conversations = db.query(DocumentConversation).filter(
        DocumentConversation.owner_id == user_id,
        DocumentConversation.uploaded_file_id == file_id,
    ).order_by(
        desc(DocumentConversation.updated_at),
        desc(DocumentConversation.id),
    ).offset(offset).limit(limit + 1).all()
    has_more = len(conversations) > limit
    conversations = conversations[:limit]
    return {
        "conversations": [serialize_document_conversation(conversation) for conversation in conversations],
        "has_more": has_more,
        "next_offset": offset + len(conversations) if has_more else None,
    }


@router.get("/documents/{file_id}/conversations/{conversation_id}")
async def get_document_conversation(
    file_id: int,
    conversation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_id: Optional[int] = Query(default=None, ge=1),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_file_or_404(file_id, user_id, db)
    conversation = db.query(DocumentConversation).filter(
        DocumentConversation.id == conversation_id,
        DocumentConversation.owner_id == user_id,
        DocumentConversation.uploaded_file_id == file_id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Document conversation not found")

    chats_query = db.query(Chat).filter(
        Chat.user_id == user_id,
        Chat.uploaded_file_id == file_id,
        Chat.document_conversation_id == conversation.id,
    )
    if before_id is not None:
        chats_query = chats_query.filter(Chat.id < before_id)
    chats = chats_query.order_by(desc(Chat.id)).limit(limit + 1).all()
    has_more = len(chats) > limit
    chats = chats[:limit]
    next_before_id = chats[-1].id if has_more and chats else None
    chats.reverse()
    return {
        **serialize_document_conversation(conversation),
        "messages": serialize_document_messages(chats),
        "has_more": has_more,
        "next_before_id": next_before_id,
    }


@router.delete("/documents/{file_id}/conversations/{conversation_id}")
async def delete_document_conversation(
    file_id: int,
    conversation_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(DocumentConversation).filter(
        DocumentConversation.id == conversation_id,
        DocumentConversation.owner_id == user_id,
        DocumentConversation.uploaded_file_id == file_id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Document conversation not found")
    db.delete(conversation)
    db.commit()
    return {"status": "deleted", "conversation_id": conversation_id}


@router.get("/general/conversations")
async def list_general_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(GeneralConversation).filter(
        GeneralConversation.owner_id == user_id
    ).order_by(desc(GeneralConversation.updated_at), desc(GeneralConversation.id))
    conversations = query.offset(offset).limit(limit + 1).all()
    has_more = len(conversations) > limit
    conversations = conversations[:limit]

    return {
        "conversations": [{
            "id": conversation.id,
            "title": conversation.title,
            "skill_id": conversation.skill_id,
            "skill_slug": conversation.skill_slug,
            "created_at": conversation.created_at.isoformat(),
            "updated_at": conversation.updated_at.isoformat(),
        } for conversation in conversations],
        "has_more": has_more,
        "next_offset": offset + len(conversations) if has_more else None,
    }


@router.get("/general/conversations/{conversation_id}")
async def get_general_conversation(
    conversation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_id: Optional[int] = Query(default=None, ge=1),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(GeneralConversation).filter(
        GeneralConversation.id == conversation_id,
        GeneralConversation.owner_id == user_id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages_query = db.query(GeneralChatMessage).filter(
        GeneralChatMessage.conversation_id == conversation.id
    )
    if before_id is not None:
        messages_query = messages_query.filter(GeneralChatMessage.id < before_id)

    messages = messages_query.order_by(desc(GeneralChatMessage.id)).limit(limit + 1).all()
    has_more = len(messages) > limit
    messages = messages[:limit]
    next_before_id = messages[-1].id if has_more and messages else None
    messages.reverse()

    return {
        "id": conversation.id,
        "title": conversation.title,
        "skill_id": conversation.skill_id,
        "skill_slug": conversation.skill_slug,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "messages": [serialize_general_message(message) for message in messages],
        "has_more": has_more,
        "next_before_id": next_before_id,
    }


@router.delete("/general/conversations/{conversation_id}")
async def delete_general_conversation(
    conversation_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(GeneralConversation).filter(
        GeneralConversation.id == conversation_id,
        GeneralConversation.owner_id == user_id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()
    return {"status": "deleted", "conversation_id": conversation_id}







@router.post("/{file_id}")
async def chat_with_file(
    request: Request,
    question: str = Body(...),
    document: int = Body(...),
    model: str = Body(...),
    language: str = Body(...),
    conversation_id: Optional[int] = Body(default=None),
    skill_slug: Optional[str] = Body(default=None),
    skill_id: Optional[int] = Body(default=None),
    file_id: int = None,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(enforce_chat_quota),
):
    request_id = get_request_id(request)
    try:
        return await process_chat_request(
            question=question,
            file_id=file_id,
            user_id=user_id,
            db=db,
            language=language,
            request_id=request_id,
            conversation_id=conversation_id,
            skill_slug=skill_slug,
            skill_id=skill_id,
        )
    except (ValidationException, FileProcessingException, DatabaseException):
        raise
    except Exception as e:
        log_error(
            e,
            context="document_chat",
            request_id=request_id,
            user_id=user_id,
            file_id=file_id,
        )
        raise DatabaseException("Unable to process the chat request", {"request_id": request_id})
    
    
@router.get("/messages/{file_id}")
async def messages_of_file(
    request: Request,
    file_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_id: Optional[int] = Query(default=None, ge=1),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start_time = time.time()
    request_id = get_request_id(request)
    
    try:
        log_info(
            "Retrieving chat messages",
            context="chat_messages",
            request_id=request_id,
            file_id=file_id,
            user_id=user_id
        )
        
        file = db.query(UploadedFile).filter(UploadedFile.owner_id == user_id, UploadedFile.id == file_id).first()
        if file is None:
            log_warning(
                "File not found for message retrieval",
                context="chat_messages",
                request_id=request_id,
                file_id=file_id,
                user_id=user_id
            )
            raise ValidationException("File not found", {"file_id": file_id, "user_id": user_id})
        
        chats_query = db.query(Chat).filter(
            Chat.uploaded_file_id == file.id,
            Chat.user_id == user_id,
        )
        if before_id is not None:
            chats_query = chats_query.filter(Chat.id < before_id)

        chats = chats_query.order_by(desc(Chat.id)).limit(limit + 1).all()
        has_more = len(chats) > limit
        chats = chats[:limit]
        next_before_id = chats[-1].id if has_more and chats else None
        chats.reverse()

        transformed_chats = []
        for chat in chats:
            if chat.question and chat.response:
                if chat.created_at_response is None or (
                    chat.created_at_question is not None
                    and chat.created_at_question <= chat.created_at_response
                ):
                    transformed_chats.append({
                        "id": f"{chat.id}-question",
                        "message": chat.question,
                        "is_user_message": True,
                        "create_at": chat.created_at_question
                    })
                    transformed_chats.append({
                        "id": f"{chat.id}-response",
                        "message": chat.response,
                        "is_user_message": False,
                        "create_at": chat.created_at_response
                    })
                else:
                    transformed_chats.append({
                        "id": f"{chat.id}-response",
                        "message": chat.response,
                        "is_user_message": False,
                        "create_at": chat.created_at_response
                    })
                    transformed_chats.append({
                        "id": f"{chat.id}-question",
                        "message": chat.question,
                        "is_user_message": True,
                        "create_at": chat.created_at_question
                    })
            # If only response exists
            elif chat.response:
                transformed_chats.append({
                    "id": f"{chat.id}-response",
                    "message": chat.response,
                    "is_user_message": False,
                    "create_at": chat.created_at_response
                })

        duration = time.time() - start_time
        log_info(
            f"Retrieved {len(transformed_chats)} chat messages",
            context="chat_messages",
            request_id=request_id,
            file_id=file_id,
            user_id=user_id,
            message_count=len(transformed_chats),
            duration=duration
        )
        
        return {
            "messages": transformed_chats,
            "has_more": has_more,
            "next_before_id": next_before_id,
        }
        
    except (ValidationException, DatabaseException):
        raise
    except Exception as e:
        duration = time.time() - start_time
        log_error(
            e,
            context="chat_messages",
            request_id=request_id,
            file_id=file_id,
            user_id=user_id,
            duration=duration
        )
        raise DatabaseException("Failed to retrieve chat messages", {"duration": duration})

