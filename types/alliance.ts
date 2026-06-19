export type AllianceName = 'GHOST LEGION' | 'PHANTOM ORDER'

export interface AllianceMeta {
  id: string
  name: AllianceName
  color: string
  badge_label: string
  member_count: number
}

export interface AllianceMember {
  player_id: string
  alliance_id: string
  joined_at: string
  last_changed_at: string
}

export interface WarDeclaration {
  id: string
  alliance_id: string
  target_country: string
  reason: string
  scheduled_at: string
  declared_at: string | null
  expires_at: string | null
  vote_yes: number
  vote_no: number
  status: 'voting' | 'declared' | 'expired' | 'cancelled'
  created_at: string
}

export interface WarVote {
  war_id: string
  player_id: string
  vote: boolean
  voted_at: string
}
