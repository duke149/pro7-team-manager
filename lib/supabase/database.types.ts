export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      finance_entries: {
        Row: {
          amount_vnd: number
          category: string
          created_at: string
          created_by_user_id: string
          description: string
          direction: string
          id: string
          occurred_on: string
          team_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          amount_vnd: number
          category: string
          created_at?: string
          created_by_user_id: string
          description: string
          direction: string
          id?: string
          occurred_on: string
          team_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          amount_vnd?: number
          category?: string
          created_at?: string
          created_by_user_id?: string
          description?: string
          direction?: string
          id?: string
          occurred_on?: string
          team_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          inviter_user_id: string | null
          role_id: string
          status: string
          team_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          inviter_user_id?: string | null
          role_id: string
          status?: string
          team_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          inviter_user_id?: string | null
          role_id?: string
          status?: string
          team_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_role_team_fkey"
            columns: ["role_id", "team_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_slots: {
        Row: {
          created_at: string
          id: string
          role_label: string
          shirt_number: number | null
          slot_key: string
          slot_kind: string
          tactic_id: string
          team_id: string
          updated_at: string
          user_id: string
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          id?: string
          role_label: string
          shirt_number?: number | null
          slot_key: string
          slot_kind: string
          tactic_id: string
          team_id: string
          updated_at?: string
          user_id: string
          x: number
          y: number
        }
        Update: {
          created_at?: string
          id?: string
          role_label?: string
          shirt_number?: number | null
          slot_key?: string
          slot_kind?: string
          tactic_id?: string
          team_id?: string
          updated_at?: string
          user_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
          {
            foreignKeyName: "lineup_slots_tactic_team_fkey"
            columns: ["tactic_id", "team_id"]
            isOneToOne: false
            referencedRelation: "match_tactics"
            referencedColumns: ["id", "team_id"]
          },
        ]
      }
      match_attendance: {
        Row: {
          invited_at: string
          invited_by_user_id: string
          match_id: string
          note: string | null
          responded_at: string | null
          status: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          invited_at?: string
          invited_by_user_id: string
          match_id: string
          note?: string | null
          responded_at?: string | null
          status?: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          invited_at?: string
          invited_by_user_id?: string
          match_id?: string
          note?: string | null
          responded_at?: string | null
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_attendance_match_team_fkey"
            columns: ["match_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "match_attendance_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      match_events: {
        Row: {
          created_at: string
          created_by_user_id: string
          event_type: string
          id: string
          match_id: string
          minute: number
          note: string | null
          player_user_id: string | null
          secondary_user_id: string | null
          sequence_no: number
          team_id: string
          team_side: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          event_type: string
          id?: string
          match_id: string
          minute: number
          note?: string | null
          player_user_id?: string | null
          secondary_user_id?: string | null
          sequence_no?: number
          team_id: string
          team_side?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          event_type?: string
          id?: string
          match_id?: string
          minute?: number
          note?: string | null
          player_user_id?: string | null
          secondary_user_id?: string | null
          sequence_no?: number
          team_id?: string
          team_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_team_fkey"
            columns: ["match_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "match_events_player_membership_fkey"
            columns: ["team_id", "player_user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
          {
            foreignKeyName: "match_events_secondary_membership_fkey"
            columns: ["team_id", "secondary_user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      match_player_stats: {
        Row: {
          assists: number
          created_at: string
          goals: number
          is_mvp: boolean
          match_id: string
          minutes_played: number
          rating: number | null
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assists?: number
          created_at?: string
          goals?: number
          is_mvp?: boolean
          match_id: string
          minutes_played?: number
          rating?: number | null
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assists?: number
          created_at?: string
          goals?: number
          is_mvp?: boolean
          match_id?: string
          minutes_played?: number
          rating?: number | null
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_player_stats_match_team_fkey"
            columns: ["match_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "match_player_stats_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      match_tactics: {
        Row: {
          applied_at: string | null
          applied_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          defensive_line: string
          formation: string
          id: string
          instructions: string | null
          match_id: string
          mode: string
          pressing: string
          status: string
          team_id: string
          updated_at: string
          version: number
        }
        Insert: {
          applied_at?: string | null
          applied_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          defensive_line: string
          formation: string
          id?: string
          instructions?: string | null
          match_id: string
          mode: string
          pressing: string
          status?: string
          team_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          applied_at?: string | null
          applied_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          defensive_line?: string
          formation?: string
          id?: string
          instructions?: string | null
          match_id?: string
          mode?: string
          pressing?: string
          status?: string
          team_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_tactics_match_team_fkey"
            columns: ["match_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
        ]
      }
      match_team_stats: {
        Row: {
          created_at: string
          match_id: string
          metrics: Json
          schema_version: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          match_id: string
          metrics?: Json
          schema_version?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          match_id?: string
          metrics?: Json
          schema_version?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_team_stats_match_team_fkey"
            columns: ["match_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
        ]
      }
      matches: {
        Row: {
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          id: string
          is_home: boolean
          opponent: string
          opponent_score: number | null
          rsvp_deadline: string
          starts_at: string
          status: string
          team_id: string
          team_score: number | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          id?: string
          is_home?: boolean
          opponent: string
          opponent_score?: number | null
          rsvp_deadline: string
          starts_at: string
          status?: string
          team_id: string
          team_score?: number | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          id?: string
          is_home?: boolean
          opponent?: string
          opponent_score?: number | null
          rsvp_deadline?: string
          starts_at?: string
          status?: string
          team_id?: string
          team_score?: number | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      member_dues: {
        Row: {
          amount_vnd: number
          created_at: string
          created_by_user_id: string
          due_date: string
          finance_entry_id: string | null
          id: string
          paid_at: string | null
          period_start: string
          status: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_vnd: number
          created_at?: string
          created_by_user_id: string
          due_date: string
          finance_entry_id?: string | null
          id?: string
          paid_at?: string | null
          period_start: string
          status?: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_vnd?: number
          created_at?: string
          created_by_user_id?: string
          due_date?: string
          finance_entry_id?: string | null
          id?: string
          paid_at?: string | null
          period_start?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_dues_finance_entry_team_fkey"
            columns: ["finance_entry_id", "team_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "member_dues_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      memberships: {
        Row: {
          joined_at: string
          role_id: string
          status: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role_id: string
          status?: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role_id?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_role_team_fkey"
            columns: ["role_id", "team_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          source_entity: string
          source_id: string
          target_path: string
          team_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          source_entity?: string
          source_id: string
          target_path: string
          team_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          source_entity?: string
          source_id?: string
          target_path?: string
          team_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_match_team_fkey"
            columns: ["source_id", "team_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "notifications_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          height_cm: number | null
          id: string
          phone: string | null
          preferred_positions: string[]
          requires_password_change: boolean
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          height_cm?: number | null
          id: string
          phone?: string | null
          preferred_positions?: string[]
          requires_password_change?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          height_cm?: number | null
          id?: string
          phone?: string | null
          preferred_positions?: string[]
          requires_password_change?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_id: string
        }
        Insert: {
          permission_code: string
          role_id: string
        }
        Update: {
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_news: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          published_at: string | null
          status: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          published_at?: string | null
          status?: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_news_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_player_profiles: {
        Row: {
          admin_notes: string | null
          created_at: string
          join_date: string
          official_position: string | null
          player_status: string
          shirt_number: number | null
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          join_date?: string
          official_position?: string | null
          player_status?: string
          shirt_number?: number | null
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          join_date?: string
          official_position?: string | null
          player_status?: string
          shirt_number?: number | null
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_player_profiles_membership_fkey"
            columns: ["team_id", "user_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["team_id", "user_id"]
          },
        ]
      }
      team_settings: {
        Row: {
          created_at: string
          settings: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          settings?: Json
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          settings?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: { Args: { token: string }; Returns: string }
      apply_match_tactic: {
        Args: {
          p_expected_updated_at: string
          p_tactic_id: string
          p_team_id: string
        }
        Returns: undefined
      }
      attach_team_member: {
        Args: {
          p_display_name: string
          p_join_date: string
          p_official_position: string
          p_requires_password_change: boolean
          p_role_id: string
          p_shirt_number: number
          p_team_id: string
          p_user_id: string
          p_verified_actor_user_id: string
        }
        Returns: undefined
      }
      create_team: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      get_current_team_access_contexts: {
        Args: never
        Returns: {
          permission_codes: string[]
          role_id: string
          role_name: string
          role_slug: string
          team_id: string
          team_name: string
          team_slug: string
        }[]
      }
      get_team_player_admin_detail: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: {
          admin_notes: string
        }[]
      }
      invite_match_attendance: {
        Args: {
          p_match_id: string
          p_team_id: string
          p_user_ids: string[]
        }
        Returns: number
      }
      manage_finance_entry: {
        Args: {
          p_action: string
          p_amount_vnd: number
          p_category: string
          p_description: string
          p_direction: string
          p_entry_id: string
          p_expected_updated_at: string
          p_occurred_on: string
          p_team_id: string
          p_void_reason: string
        }
        Returns: string
      }
      manage_match: {
        Args: {
          p_action: string
          p_expected_updated_at: string
          p_is_home: boolean
          p_match_id: string
          p_opponent: string
          p_opponent_score: number
          p_rsvp_deadline: string
          p_starts_at: string
          p_team_id: string
          p_team_score: number
          p_venue: string
        }
        Returns: string
      }
      manage_match_analysis: {
        Args: {
          p_events: Json
          p_expected_updated_at: string
          p_match_id: string
          p_player_stats: Json
          p_team_id: string
          p_team_metrics: Json
        }
        Returns: string
      }
      manage_member_due: {
        Args: {
          p_action: string
          p_amount_vnd: number
          p_due_date: string
          p_due_id: string
          p_expected_updated_at: string
          p_note: string
          p_period_start: string
          p_team_id: string
          p_user_id: string
        }
        Returns: string
      }
      manage_team_player: {
        Args: {
          p_admin_notes: string
          p_deactivate: boolean
          p_join_date: string
          p_official_position: string
          p_player_status: string
          p_role_id: string
          p_shirt_number: number
          p_team_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      remind_match_attendance: {
        Args: {
          p_match_id: string
          p_team_id: string
        }
        Returns: number
      }
      respond_match_attendance: {
        Args: {
          p_expected_updated_at: string
          p_match_id: string
          p_note: string
          p_status: string
          p_team_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      save_match_tactic: {
        Args: {
          p_defensive_line: string
          p_expected_updated_at: string
          p_formation: string
          p_instructions: string
          p_match_id: string
          p_mode: string
          p_pressing: string
          p_slots: Json
          p_tactic_id: string
          p_team_id: string
          p_version: number
        }
        Returns: string
      }
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
  public: {
    Enums: {},
  },
} as const
