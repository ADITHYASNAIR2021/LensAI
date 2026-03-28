"""
Teams API — create, manage, and invite members.
"""

import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import require_user, CurrentUser
from ...core.database import get_db
from ...models.user import Team, TeamMember, User

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return f'{slug}-{uuid.uuid4().hex[:6]}'


class CreateTeamRequest(BaseModel):
    name: str


class InviteMemberRequest(BaseModel):
    email: str
    role: str = 'member'


@router.get('')
async def list_teams(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user.user_id)
    )
    teams = result.scalars().all()
    return {'teams': [{'id': t.id, 'name': t.name, 'slug': t.slug} for t in teams]}


@router.post('')
async def create_team(
    body: CreateTeamRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_pro:
        raise HTTPException(status_code=403, detail='Team plan required to create teams.')

    team = Team(name=body.name, slug=_slugify(body.name), owner_id=user.user_id)
    db.add(team)
    await db.flush()

    # Add owner as member
    member = TeamMember(team_id=team.id, user_id=user.user_id, role='owner')
    db.add(member)
    await db.flush()

    return {'id': team.id, 'name': team.name, 'slug': team.slug}


@router.get('/{team_id}/members')
async def list_members(
    team_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, team_id, user.user_id)
    result = await db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.team_id == team_id)
    )
    rows = result.all()
    return {
        'members': [
            {
                'user_id': m.user_id,
                'email': u.email,
                'name': u.name,
                'role': m.role,
                'joined_at': m.joined_at.isoformat(),
            }
            for m, u in rows
        ]
    }


@router.post('/{team_id}/invite')
async def invite_member(
    team_id: str,
    body: InviteMemberRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_admin(db, team_id, user.user_id)

    # Find user by email
    result = await db.execute(select(User).where(User.email == body.email))
    invitee = result.scalar_one_or_none()
    if not invitee:
        raise HTTPException(status_code=404, detail='User not found. They must sign in to LensAI first.')

    # Check already a member
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == invitee.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='User is already a team member.')

    member = TeamMember(team_id=team_id, user_id=invitee.id, role=body.role)
    db.add(member)
    return {'ok': True, 'user_id': invitee.id, 'email': invitee.email}


@router.delete('/{team_id}/members/{member_user_id}')
async def remove_member(
    team_id: str,
    member_user_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_admin(db, team_id, user.user_id)
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == member_user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')
    if member.role == 'owner':
        raise HTTPException(status_code=400, detail='Cannot remove team owner')
    await db.delete(member)
    return {'ok': True}


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _check_membership(db: AsyncSession, team_id: str, user_id: str) -> TeamMember:
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail='Not a member of this team')
    return m


async def _check_admin(db: AsyncSession, team_id: str, user_id: str) -> TeamMember:
    m = await _check_membership(db, team_id, user_id)
    if m.role not in ('owner', 'admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return m
