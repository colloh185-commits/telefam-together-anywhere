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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          client_ts: string | null
          created_at: string
          device_hash: string | null
          event: string
          id: number
          ip_hash: string | null
          meta: Json
          user_id: string | null
        }
        Insert: {
          client_ts?: string | null
          created_at?: string
          device_hash?: string | null
          event: string
          id?: never
          ip_hash?: string | null
          meta?: Json
          user_id?: string | null
        }
        Update: {
          client_ts?: string | null
          created_at?: string
          device_hash?: string | null
          event?: string
          id?: never
          ip_hash?: string | null
          meta?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      auth_throttle: {
        Row: {
          blocked_until: string | null
          hits: number
          key: string
          last_hit: string
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          hits?: number
          key: string
          last_hit?: string
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          hits?: number
          key?: string
          last_hit?: string
          window_start?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bytes: number
          created_at: string
          dhash: string
          height: number
          id: string
          kind: string
          mime: string
          owner_id: string
          sha256: string
          storage_path: string
          width: number
        }
        Insert: {
          bytes: number
          created_at?: string
          dhash: string
          height: number
          id?: string
          kind: string
          mime: string
          owner_id: string
          sha256: string
          storage_path: string
          width: number
        }
        Update: {
          bytes?: number
          created_at?: string
          dhash?: string
          height?: number
          id?: string
          kind?: string
          mime?: string
          owner_id?: string
          sha256?: string
          storage_path?: string
          width?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_media_id: string | null
          bio: string
          created_at: string
          date_of_birth: string
          full_name: string
          gender: string
          id: string
          location_label: string | null
          location_lat: number | null
          location_lng: number | null
          phone_country: string
          phone_e164: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_media_id?: string | null
          bio?: string
          created_at?: string
          date_of_birth: string
          full_name: string
          gender: string
          id: string
          location_label?: string | null
          location_lat?: number | null
          location_lng?: number | null
          phone_country: string
          phone_e164: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_media_id?: string | null
          bio?: string
          created_at?: string
          date_of_birth?: string
          full_name?: string
          gender?: string
          id?: string
          location_label?: string | null
          location_lat?: number | null
          location_lng?: number | null
          phone_country?: string
          phone_e164?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      throttle_hit: {
        Args: {
          _key: string
          _limit: number
          _mode: string
          _window_seconds: number
        }
        Returns: number
      }
      throttle_reset: { Args: { _key: string }; Returns: undefined }
      username_available: { Args: { _username: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
