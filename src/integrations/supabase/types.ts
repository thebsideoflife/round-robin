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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      clinic_assignments: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_assignments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string
          division: string | null
          id: string
          location: string | null
          name: string
          provider_count: number
          region: string | null
          specialty: string | null
          staff_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          division?: string | null
          id?: string
          location?: string | null
          name: string
          provider_count?: number
          region?: string | null
          specialty?: string | null
          staff_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          division?: string | null
          id?: string
          location?: string | null
          name?: string
          provider_count?: number
          region?: string | null
          specialty?: string | null
          staff_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      coaching_plans: {
        Row: {
          checkpoints: Json | null
          gap_summary: string | null
          id: string
          provider_id: string | null
          provider_name: string
          report_id: string
          scripts: Json | null
          shadow_recommendation: string | null
        }
        Insert: {
          checkpoints?: Json | null
          gap_summary?: string | null
          id?: string
          provider_id?: string | null
          provider_name: string
          report_id: string
          scripts?: Json | null
          shadow_recommendation?: string | null
        }
        Update: {
          checkpoints?: Json | null
          gap_summary?: string | null
          id?: string
          provider_id?: string | null
          provider_name?: string
          report_id?: string
          scripts?: Json | null
          shadow_recommendation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_plans_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "report_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_plans_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          actions: Json | null
          created_at: string
          current_value: number | null
          drivers: Json | null
          goal: string | null
          id: string
          opp_type: string
          owner_role: string | null
          rank: number | null
          reason: string | null
          report_id: string
          target_metric: string | null
          target_value: number | null
          timeline_30: string | null
          timeline_60: string | null
          timeline_90: string | null
          title: string
        }
        Insert: {
          actions?: Json | null
          created_at?: string
          current_value?: number | null
          drivers?: Json | null
          goal?: string | null
          id?: string
          opp_type: string
          owner_role?: string | null
          rank?: number | null
          reason?: string | null
          report_id: string
          target_metric?: string | null
          target_value?: number | null
          timeline_30?: string | null
          timeline_60?: string | null
          timeline_90?: string | null
          title: string
        }
        Update: {
          actions?: Json | null
          created_at?: string
          current_value?: number | null
          drivers?: Json | null
          goal?: string | null
          id?: string
          opp_type?: string
          owner_role?: string | null
          rank?: number | null
          reason?: string | null
          report_id?: string
          target_metric?: string | null
          target_value?: number | null
          timeline_30?: string | null
          timeline_60?: string | null
          timeline_90?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_users: {
        Row: {
          created_at: string
          email: string
          requested_via: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          requested_via?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          requested_via?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_priority_index: {
        Row: {
          correlation: number | null
          id: string
          percentile: number | null
          question: string
          rank: number | null
          report_id: string
        }
        Insert: {
          correlation?: number | null
          id?: string
          percentile?: number | null
          question: string
          rank?: number | null
          report_id: string
        }
        Update: {
          correlation?: number | null
          id?: string
          percentile?: number | null
          question?: string
          rank?: number | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_priority_index_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_providers: {
        Row: {
          id: string
          n: number | null
          name: string
          percentile: number | null
          report_id: string
          tier: string | null
          top_box: number | null
        }
        Insert: {
          id?: string
          n?: number | null
          name: string
          percentile?: number | null
          report_id: string
          tier?: string | null
          top_box?: number | null
        }
        Update: {
          id?: string
          n?: number | null
          name?: string
          percentile?: number | null
          report_id?: string
          tier?: string | null
          top_box?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_providers_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          id: string
          n: number | null
          name: string
          percentile: number | null
          report_id: string
          top_box: number | null
        }
        Insert: {
          id?: string
          n?: number | null
          name: string
          percentile?: number | null
          report_id: string
          top_box?: number | null
        }
        Update: {
          id?: string
          n?: number | null
          name?: string
          percentile?: number | null
          report_id?: string
          top_box?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          clinic_id: string | null
          created_at: string
          error_message: string | null
          exec_summary: string | null
          facility_name: string | null
          id: string
          insights: Json | null
          n: number | null
          overall_percentile: number | null
          overall_top_box: number | null
          raw_extraction: Json | null
          service_line: string | null
          site_name: string
          status: string
          time_frame: string | null
          trends: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          error_message?: string | null
          exec_summary?: string | null
          facility_name?: string | null
          id?: string
          insights?: Json | null
          n?: number | null
          overall_percentile?: number | null
          overall_top_box?: number | null
          raw_extraction?: Json | null
          service_line?: string | null
          site_name?: string
          status?: string
          time_frame?: string | null
          trends?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          error_message?: string | null
          exec_summary?: string | null
          facility_name?: string | null
          id?: string
          insights?: Json | null
          n?: number | null
          overall_percentile?: number | null
          overall_top_box?: number | null
          raw_extraction?: Json | null
          service_line?: string | null
          site_name?: string
          status?: string
          time_frame?: string | null
          trends?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      round_findings: {
        Row: {
          created_at: string
          finding_text: string
          id: string
          round_id: string
          severity: string
          theme: string
        }
        Insert: {
          created_at?: string
          finding_text: string
          id?: string
          round_id: string
          severity?: string
          theme: string
        }
        Update: {
          created_at?: string
          finding_text?: string
          id?: string
          round_id?: string
          severity?: string
          theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_findings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_wins: {
        Row: {
          category: string | null
          created_at: string
          id: string
          recognized_person: string | null
          round_id: string
          win_text: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          recognized_person?: string | null
          round_id: string
          win_text: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          recognized_person?: string | null
          round_id?: string
          win_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_wins_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          ai_summary: string | null
          answers: Json | null
          clinic_id: string
          created_at: string
          id: string
          individual: string | null
          individual_role: string | null
          leader_id: string
          notes: string | null
          round_date: string
          safety_flag: boolean
          status: string
          summary: string | null
          themes: string[] | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          answers?: Json | null
          clinic_id: string
          created_at?: string
          id?: string
          individual?: string | null
          individual_role?: string | null
          leader_id: string
          notes?: string | null
          round_date?: string
          safety_flag?: boolean
          status?: string
          summary?: string | null
          themes?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          answers?: Json | null
          clinic_id?: string
          created_at?: string
          id?: string
          individual?: string | null
          individual_role?: string | null
          leader_id?: string
          notes?: string | null
          round_date?: string
          safety_flag?: boolean
          status?: string
          summary?: string | null
          themes?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_level: string | null
          from_status: string | null
          id: string
          note: string | null
          task_id: string
          to_level: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_level?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          task_id: string
          to_level?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_level?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          task_id?: string
          to_level?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          clinic_id: string
          closed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          escalation_level: string
          id: string
          name: string
          owner_id: string | null
          owner_role: string | null
          priority: string
          report_id: string | null
          safety_related: boolean
          source: string
          source_id: string | null
          status: string
          theme: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          escalation_level?: string
          id?: string
          name: string
          owner_id?: string | null
          owner_role?: string | null
          priority?: string
          report_id?: string | null
          safety_related?: boolean
          source?: string
          source_id?: string | null
          status?: string
          theme?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          closed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          escalation_level?: string
          id?: string
          name?: string
          owner_id?: string | null
          owner_role?: string | null
          priority?: string
          report_id?: string | null
          safety_related?: boolean
          source?: string
          source_id?: string | null
          status?: string
          theme?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          director_id: string | null
          executive_director_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          director_id?: string | null
          executive_director_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          director_id?: string | null
          executive_director_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_clinic: {
        Args: { _clinic_id: string; _viewer: string }
        Returns: boolean
      }
      can_access_user_data: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      current_user_has_access: { Args: never; Returns: boolean }
      get_me: {
        Args: never
        Returns: {
          email: string
          full_name: string
          roles: Database["public"]["Enums"]["app_role"][]
          title: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_supervisor_of: {
        Args: { _supervisor: string; _target: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "cao"
        | "executive_director"
        | "director"
        | "manager"
        | "coordinator"
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
    Enums: {
      app_role: ["admin", "cao", "executive_director", "director", "manager", "coordinator"],
    },
  },
} as const
