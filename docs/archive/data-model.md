# Data Model

## Philosophy

Persistent player identity.

Season participation should attach to persistent entities instead of duplicating records each season.

## Core Entities

## PlayerProfile

Persistent player identity.

Fields:
- id
- discord_id
- discord_username
- ign
- avatar_url
- banner_url
- timezone
- primary_role
- secondary_roles
- tags
- bio_status
- created_at

## Season

Fields:
- id
- name
- active
- draft_date
- roster_size
- created_at

## Org

Persistent org identity.

Fields:
- id
- name
- slug
- logo_url
- accent_color
- created_at

## SeasonOrg

Org participation for a season.

Fields:
- id
- season_id
- org_id
- captain_player_id
- draft_position

## SeasonParticipant

Approved player for a specific season.

Fields:
- id
- season_id
- player_profile_id
- approved
- eligible
- admin_notes

## DraftPick

Fields:
- id
- season_id
- round
- overall_pick
- org_id
- player_profile_id
- drafted_by
- created_at

## RosterMembership

Fields:
- id
- season_id
- org_id
- player_profile_id
- captain
- created_at

## CaptainPrivateNote

Private captain scouting notes.

Fields:
- id
- captain_player_id
- target_player_id
- note_body
- created_at
- updated_at

These notes are never public.

## QueueState

Private captain queue state.

Fields:
- id
- captain_player_id
- target_player_id
- queue_order
- created_at

## Future Systems

Potential later systems:
- championships
- awards
- tournaments
- standings
- OCR integrations
- stat ingestion
