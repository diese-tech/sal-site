export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          payload: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          payload?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          payload?: Json | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          discord_id: string
          discord_username: string
          display_name: string
          role: string
        }
        Insert: {
          created_at?: string
          discord_id: string
          discord_username?: string
          display_name?: string
          role: string
        }
        Update: {
          created_at?: string
          discord_id?: string
          discord_username?: string
          display_name?: string
          role?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          pinned: boolean
          title: string
        }
        Insert: {
          body: string
          category: string
          created_at: string
          id: string
          pinned?: boolean
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_discord_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value_json: Json | null
          note: string | null
          old_value_json: Json | null
          pending_action_id: string | null
        }
        Insert: {
          action_type: string
          actor_discord_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_value_json?: Json | null
          note?: string | null
          old_value_json?: Json | null
          pending_action_id?: string | null
        }
        Update: {
          action_type?: string
          actor_discord_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value_json?: Json | null
          note?: string | null
          old_value_json?: Json | null
          pending_action_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_pending_action_id_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      captain_shortlists: {
        Row: {
          created_at: string
          draft_room_id: string
          id: string
          org_id: string
          player_id: string
          position: number
        }
        Insert: {
          created_at?: string
          draft_room_id: string
          id?: string
          org_id: string
          player_id: string
          position?: number
        }
        Update: {
          created_at?: string
          draft_room_id?: string
          id?: string
          org_id?: string
          player_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "captain_shortlists_draft_room_id_fkey"
            columns: ["draft_room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      captain_tokens: {
        Row: {
          created_at: string
          draft_room_id: string
          expires_at: string
          id: string
          org_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          draft_room_id: string
          expires_at: string
          id: string
          org_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          draft_room_id?: string
          expires_at?: string
          id?: string
          org_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "captain_tokens_draft_room_id_fkey"
            columns: ["draft_room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captain_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      division_role_mappings: {
        Row: {
          created_at: string
          discord_role_id: string
          division_id: string
          updated_at: string
          updated_by_discord_id: string
        }
        Insert: {
          created_at?: string
          discord_role_id: string
          division_id: string
          updated_at?: string
          updated_by_discord_id: string
        }
        Update: {
          created_at?: string
          discord_role_id?: string
          division_id?: string
          updated_at?: string
          updated_by_discord_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_role_mappings_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          accent_color: string
          description: string
          id: string
          name: string
          tier: number
        }
        Insert: {
          accent_color: string
          description: string
          id: string
          name: string
          tier: number
        }
        Update: {
          accent_color?: string
          description?: string
          id?: string
          name?: string
          tier?: number
        }
        Relationships: []
      }
      draft_chat_messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: number
          sender_name: string
          session_id: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: never
          sender_name: string
          session_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: never
          sender_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "god_draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          draft_room_id: string
          id: number
          org_id: string
          pick_number: number
          picked_at: string
          player_id: string
        }
        Insert: {
          draft_room_id: string
          id?: number
          org_id: string
          pick_number: number
          picked_at?: string
          player_id: string
        }
        Update: {
          draft_room_id?: string
          id?: number
          org_id?: string
          pick_number?: number
          picked_at?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_draft_room_id_fkey"
            columns: ["draft_room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_rooms: {
        Row: {
          base_order: Json
          completed_at: string | null
          created_at: string
          current_pick_index: number
          division_id: string
          id: string
          pick_started_at: string | null
          pick_timer_seconds: number
          rounds: number
          season_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          base_order?: Json
          completed_at?: string | null
          created_at?: string
          current_pick_index?: number
          division_id: string
          id: string
          pick_started_at?: string | null
          pick_timer_seconds?: number
          rounds?: number
          season_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          base_order?: Json
          completed_at?: string | null
          created_at?: string
          current_pick_index?: number
          division_id?: string
          id?: string
          pick_started_at?: string | null
          pick_timer_seconds?: number
          rounds?: number
          season_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_rooms_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_rooms_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          field_order: number
          field_type: string
          hidden: boolean
          id: string
          key: string
          label: string
          locked: boolean
          options: Json | null
          placeholder: string | null
          required: boolean
          validation_hint: string | null
        }
        Insert: {
          field_order: number
          field_type: string
          hidden?: boolean
          id: string
          key: string
          label: string
          locked?: boolean
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          validation_hint?: string | null
        }
        Update: {
          field_order?: number
          field_type?: string
          hidden?: boolean
          id?: string
          key?: string
          label?: string
          locked?: boolean
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          validation_hint?: string | null
        }
        Relationships: []
      }
      god_bans: {
        Row: {
          created_at: string
          game_number: number
          god_id: string
          god_name: string
          id: number
          match_id: string
          org_id: string
          session_id: string
          slot: number
        }
        Insert: {
          created_at?: string
          game_number: number
          god_id: string
          god_name: string
          id?: never
          match_id: string
          org_id: string
          session_id: string
          slot: number
        }
        Update: {
          created_at?: string
          game_number?: number
          god_id?: string
          god_name?: string
          id?: never
          match_id?: string
          org_id?: string
          session_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "god_bans_god_id_fkey"
            columns: ["god_id"]
            isOneToOne: false
            referencedRelation: "gods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_bans_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_bans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_bans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "god_draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      god_draft_sessions: {
        Row: {
          away_ready: boolean
          completed_at: string | null
          created_at: string
          current_phase_index: number
          current_side: string | null
          current_step_index: number
          current_type: string | null
          draft_state: Json
          game_number: number
          home_ready: boolean
          id: string
          match_id: string
          reset_requested_by: string | null
          status: string
          turn_started_at: string | null
          updated_at: string
        }
        Insert: {
          away_ready?: boolean
          completed_at?: string | null
          created_at?: string
          current_phase_index?: number
          current_side?: string | null
          current_step_index?: number
          current_type?: string | null
          draft_state?: Json
          game_number?: number
          home_ready?: boolean
          id?: string
          match_id: string
          reset_requested_by?: string | null
          status?: string
          turn_started_at?: string | null
          updated_at?: string
        }
        Update: {
          away_ready?: boolean
          completed_at?: string | null
          created_at?: string
          current_phase_index?: number
          current_side?: string | null
          current_step_index?: number
          current_type?: string | null
          draft_state?: Json
          game_number?: number
          home_ready?: boolean
          id?: string
          match_id?: string
          reset_requested_by?: string | null
          status?: string
          turn_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "god_draft_sessions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      god_picks: {
        Row: {
          created_at: string
          game_number: number
          god_id: string
          god_name: string
          id: number
          match_id: string
          org_id: string
          session_id: string
          slot: number
        }
        Insert: {
          created_at?: string
          game_number: number
          god_id: string
          god_name: string
          id?: never
          match_id: string
          org_id: string
          session_id: string
          slot: number
        }
        Update: {
          created_at?: string
          game_number?: number
          god_id?: string
          god_name?: string
          id?: never
          match_id?: string
          org_id?: string
          session_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "god_picks_god_id_fkey"
            columns: ["god_id"]
            isOneToOne: false
            referencedRelation: "gods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_picks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_picks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "god_picks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "god_draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gods: {
        Row: {
          class: string
          god_class: string
          id: string
          name: string
          pantheon: string | null
        }
        Insert: {
          class: string
          god_class: string
          id: string
          name: string
          pantheon?: string | null
        }
        Update: {
          class?: string
          god_class?: string
          id?: string
          name?: string
          pantheon?: string | null
        }
        Relationships: []
      }
      items: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string | null
          metadata: Json
          name: string
          source_updated_at: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          image_url?: string | null
          metadata?: Json
          name: string
          source_updated_at?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          metadata?: Json
          name?: string
          source_updated_at?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      match_reports: {
        Row: {
          away_score: number | null
          created_at: string
          division_id: string
          extracted_data: Json | null
          home_score: number | null
          id: string
          match_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_urls: string[]
          season_id: string
          status: string
          submitted_by: string
          total_games: number | null
        }
        Insert: {
          away_score?: number | null
          created_at?: string
          division_id: string
          extracted_data?: Json | null
          home_score?: number | null
          id?: string
          match_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_urls?: string[]
          season_id: string
          status?: string
          submitted_by: string
          total_games?: number | null
        }
        Update: {
          away_score?: number | null
          created_at?: string
          division_id?: string
          extracted_data?: Json | null
          home_score?: number | null
          id?: string
          match_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_urls?: string[]
          season_id?: string
          status?: string
          submitted_by?: string
          total_games?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          archived_at: string | null
          away_org_id: string
          away_score: number | null
          deletion_scheduled_at: string | null
          division_id: string
          home_org_id: string
          home_score: number | null
          id: string
          proof_thread_id: string | null
          proof_thread_url: string | null
          scheduled_date: string
          scheduled_time: string
          score: string | null
          screenshot_count: number
          screenshot_expected: number | null
          season_id: string | null
          status: string
          stream_url: string | null
          vod_url: string | null
          week: number
          winner_org_id: string | null
        }
        Insert: {
          archived_at?: string | null
          away_org_id: string
          away_score?: number | null
          deletion_scheduled_at?: string | null
          division_id: string
          home_org_id: string
          home_score?: number | null
          id: string
          proof_thread_id?: string | null
          proof_thread_url?: string | null
          scheduled_date: string
          scheduled_time: string
          score?: string | null
          screenshot_count?: number
          screenshot_expected?: number | null
          season_id?: string | null
          status: string
          stream_url?: string | null
          vod_url?: string | null
          week: number
          winner_org_id?: string | null
        }
        Update: {
          archived_at?: string | null
          away_org_id?: string
          away_score?: number | null
          deletion_scheduled_at?: string | null
          division_id?: string
          home_org_id?: string
          home_score?: number | null
          id?: string
          proof_thread_id?: string | null
          proof_thread_url?: string | null
          scheduled_date?: string
          scheduled_time?: string
          score?: string | null
          screenshot_count?: number
          screenshot_expected?: number | null
          season_id?: string | null
          status?: string
          stream_url?: string | null
          vod_url?: string | null
          week?: number
          winner_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_org_id_fkey"
            columns: ["away_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_away_season_org_fkey"
            columns: ["season_id", "away_org_id"]
            isOneToOne: false
            referencedRelation: "season_orgs"
            referencedColumns: ["season_id", "org_id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_org_id_fkey"
            columns: ["home_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_season_org_fkey"
            columns: ["season_id", "home_org_id"]
            isOneToOne: false
            referencedRelation: "season_orgs"
            referencedColumns: ["season_id", "org_id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_org_id_fkey"
            columns: ["winner_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_brands: {
        Row: {
          id: string
          name: string
          tag: string
        }
        Insert: {
          id: string
          name: string
          tag: string
        }
        Update: {
          id?: string
          name?: string
          tag?: string
        }
        Relationships: []
      }
      orgs: {
        Row: {
          accent_gradient: string
          archived_at: string | null
          brand_id: string | null
          captain_id: string | null
          deletion_scheduled_at: string | null
          division_id: string
          founded: string | null
          id: string
          logo_gradient: string
          logo_initials: string
          name: string
          primary_color: string
          social_links: Json | null
          tag: string
        }
        Insert: {
          accent_gradient: string
          archived_at?: string | null
          brand_id?: string | null
          captain_id?: string | null
          deletion_scheduled_at?: string | null
          division_id: string
          founded?: string | null
          id: string
          logo_gradient: string
          logo_initials: string
          name: string
          primary_color: string
          social_links?: Json | null
          tag: string
        }
        Update: {
          accent_gradient?: string
          archived_at?: string | null
          brand_id?: string | null
          captain_id?: string | null
          deletion_scheduled_at?: string | null
          division_id?: string
          founded?: string | null
          id?: string
          logo_gradient?: string
          logo_initials?: string
          name?: string
          primary_color?: string
          social_links?: Json | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "org_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_actions: {
        Row: {
          admin_note: string | null
          admin_review_message_id: string | null
          approved_at: string | null
          approved_by_discord_id: string | null
          created_at: string
          division_id: string | null
          id: string
          match_id: string | null
          payload_json: Json
          public_receipt_message_id: string | null
          requested_by_discord_id: string
          source_discord_message_url: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          admin_review_message_id?: string | null
          approved_at?: string | null
          approved_by_discord_id?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          match_id?: string | null
          payload_json?: Json
          public_receipt_message_id?: string | null
          requested_by_discord_id: string
          source_discord_message_url?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          admin_review_message_id?: string | null
          approved_at?: string | null
          approved_by_discord_id?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          match_id?: string | null
          payload_json?: Json
          public_receipt_message_id?: string | null
          requested_by_discord_id?: string
          source_discord_message_url?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_actions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_stat_records: {
        Row: {
          confidence: number
          correction_note: string | null
          created_at: string
          extracted_json: Json
          id: string
          match_id: string
          player_id: string | null
          reviewed_at: string | null
          reviewed_by_discord_id: string | null
          screenshot_url: string
          source: string
          stats_json: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence: number
          correction_note?: string | null
          created_at?: string
          extracted_json?: Json
          id?: string
          match_id: string
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by_discord_id?: string | null
          screenshot_url: string
          source?: string
          stats_json?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          correction_note?: string | null
          created_at?: string
          extracted_json?: Json
          id?: string
          match_id?: string
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by_discord_id?: string | null
          screenshot_url?: string
          source?: string
          stats_json?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_stat_records_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_stat_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          assists: number
          created_at: string
          damage_dealt: number | null
          damage_mitigated: number | null
          deaths: number
          division_id: string
          game_number: number
          god_played: string | null
          id: string
          kills: number
          match_id: string
          match_report_id: string
          org_id: string | null
          player_id: string | null
          player_ign: string
          role: string | null
          season_id: string
          won: boolean
        }
        Insert: {
          assists?: number
          created_at?: string
          damage_dealt?: number | null
          damage_mitigated?: number | null
          deaths?: number
          division_id: string
          game_number: number
          god_played?: string | null
          id?: string
          kills?: number
          match_id: string
          match_report_id: string
          org_id?: string | null
          player_id?: string | null
          player_ign: string
          role?: string | null
          season_id: string
          won: boolean
        }
        Update: {
          assists?: number
          created_at?: string
          damage_dealt?: number | null
          damage_mitigated?: number | null
          deaths?: number
          division_id?: string
          game_number?: number
          god_played?: string | null
          id?: string
          kills?: number
          match_id?: string
          match_report_id?: string
          org_id?: string | null
          player_id?: string | null
          player_ign?: string
          role?: string | null
          season_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_match_report_id_fkey"
            columns: ["match_report_id"]
            isOneToOne: false
            referencedRelation: "match_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats: {
        Row: {
          assists: number | null
          created_at: string
          damage_dealt: number | null
          damage_mitigated: number | null
          deaths: number | null
          game_number: number
          god_played: string | null
          healing_done: number | null
          id: string
          kills: number | null
          match_id: string
          pending_stat_record_id: string | null
          player_id: string
          role: string | null
          won: boolean | null
        }
        Insert: {
          assists?: number | null
          created_at?: string
          damage_dealt?: number | null
          damage_mitigated?: number | null
          deaths?: number | null
          game_number?: number
          god_played?: string | null
          healing_done?: number | null
          id?: string
          kills?: number | null
          match_id: string
          pending_stat_record_id?: string | null
          player_id: string
          role?: string | null
          won?: boolean | null
        }
        Update: {
          assists?: number | null
          created_at?: string
          damage_dealt?: number | null
          damage_mitigated?: number | null
          deaths?: number | null
          game_number?: number
          god_played?: string | null
          healing_done?: number | null
          id?: string
          kills?: number | null
          match_id?: string
          pending_stat_record_id?: string | null
          player_id?: string
          role?: string | null
          won?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_pending_stat_record_id_fkey"
            columns: ["pending_stat_record_id"]
            isOneToOne: false
            referencedRelation: "pending_stat_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          archived_at: string | null
          avatar_gradient: string
          avatar_initials: string
          deletion_scheduled_at: string | null
          discord_id: string | null
          discord_username: string
          display_alias: string | null
          division_id: string | null
          id: string
          ign: string
          is_captain: boolean
          is_starter: boolean
          org_id: string | null
          primary_role: string
          profile_claimed: boolean
          secondary_roles: Json
          stats: Json | null
          status: string
        }
        Insert: {
          archived_at?: string | null
          avatar_gradient: string
          avatar_initials: string
          deletion_scheduled_at?: string | null
          discord_id?: string | null
          discord_username: string
          display_alias?: string | null
          division_id?: string | null
          id: string
          ign: string
          is_captain?: boolean
          is_starter?: boolean
          org_id?: string | null
          primary_role: string
          profile_claimed?: boolean
          secondary_roles?: Json
          stats?: Json | null
          status: string
        }
        Update: {
          archived_at?: string | null
          avatar_gradient?: string
          avatar_initials?: string
          deletion_scheduled_at?: string | null
          discord_id?: string | null
          discord_username?: string
          display_alias?: string | null
          division_id?: string | null
          id?: string
          ign?: string
          is_captain?: boolean
          is_starter?: boolean
          org_id?: string | null
          primary_role?: string
          profile_claimed?: boolean
          secondary_roles?: Json
          stats?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          created_at: string
          discord_display_name: string | null
          discord_id: string
          discord_username: string
          form_data: Json
          id: string
          player_id: string | null
          reviewed_at: string | null
          reviewer_note: string | null
          season_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          discord_display_name?: string | null
          discord_id: string
          discord_username: string
          form_data?: Json
          id: string
          player_id?: string | null
          reviewed_at?: string | null
          reviewer_note?: string | null
          season_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          discord_display_name?: string | null
          discord_id?: string
          discord_username?: string
          form_data?: Json
          id?: string
          player_id?: string | null
          reviewed_at?: string | null
          reviewer_note?: string | null
          season_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_orgs: {
        Row: {
          created_at: string
          division_id: string
          org_id: string
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: string
          org_id: string
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string
          org_id?: string
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_orgs_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_orgs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_orgs_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_rosters: {
        Row: {
          created_at: string
          division_id: string | null
          is_captain: boolean
          org_id: string | null
          player_id: string
          roster_status: string
          season_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id?: string | null
          is_captain?: boolean
          org_id?: string | null
          player_id: string
          roster_status?: string
          season_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string | null
          is_captain?: boolean
          org_id?: string | null
          player_id?: string
          roster_status?: string
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_rosters_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rosters_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rosters_season_org_division_fkey"
            columns: ["season_id", "org_id", "division_id"]
            isOneToOne: false
            referencedRelation: "season_orgs"
            referencedColumns: ["season_id", "org_id", "division_id"]
          },
        ]
      }
      seasons: {
        Row: {
          current_week: number
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          status: string
        }
        Insert: {
          current_week?: number
          end_date: string
          id: string
          is_current?: boolean
          name: string
          start_date: string
          status: string
        }
        Update: {
          current_week?: number
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
          division_id: string
          games_back: number
          losses: number
          matches_played: number
          org_id: string
          points_against: number
          points_for: number
          streak: Json
          wins: number
        }
        Insert: {
          division_id: string
          games_back?: number
          losses?: number
          matches_played?: number
          org_id: string
          points_against?: number
          points_for?: number
          streak?: Json
          wins?: number
        }
        Update: {
          division_id?: string
          games_back?: number
          losses?: number
          matches_played?: number
          org_id?: string
          points_against?: number
          points_for?: number
          streak?: Json
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_god_draft: {
        Args: {
          p_bans: Json
          p_draft_state: Json
          p_game_number: number
          p_match_id: string
          p_picks: Json
          p_session_id: string
        }
        Returns: undefined
      }
      replace_match_report_stats: {
        Args: { p_match_report_id: string; p_rows: Json }
        Returns: undefined
      }
      replace_standings: { Args: { p_rows: Json }; Returns: undefined }
      set_current_season: {
        Args: { p_season_id: string }
        Returns: {
          current_week: number
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_draft_pick: {
        Args: {
          p_draft_room_id: string
          p_expected_pick_index: number
          p_org_id: string
          p_player_id: string
          p_total_picks: number
        }
        Returns: undefined
      }
      undo_last_pick: { Args: { p_draft_room_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
