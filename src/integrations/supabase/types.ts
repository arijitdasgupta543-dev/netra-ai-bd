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
      eye_images: {
        Row: {
          blur_score: number | null
          brightness: number | null
          capture_checks: Json | null
          circle_cx: number | null
          circle_cy: number | null
          circle_r: number | null
          created_at: string
          created_by: string
          eye: string
          flash_used: boolean | null
          glare_fraction: number | null
          guide_box: Json | null
          id: string
          lighting: string | null
          notes: string | null
          patient_id: string
          phone_model: string | null
          pupil_circle_confirmed: boolean
          pupil_roi_path: string | null
          quality_status: string | null
          roi_storage_path: string | null
          storage_path: string
          visual_acuity: string | null
        }
        Insert: {
          blur_score?: number | null
          brightness?: number | null
          capture_checks?: Json | null
          circle_cx?: number | null
          circle_cy?: number | null
          circle_r?: number | null
          created_at?: string
          created_by?: string
          eye: string
          flash_used?: boolean | null
          glare_fraction?: number | null
          guide_box?: Json | null
          id?: string
          lighting?: string | null
          notes?: string | null
          patient_id: string
          phone_model?: string | null
          pupil_circle_confirmed?: boolean
          pupil_roi_path?: string | null
          quality_status?: string | null
          roi_storage_path?: string | null
          storage_path: string
          visual_acuity?: string | null
        }
        Update: {
          blur_score?: number | null
          brightness?: number | null
          capture_checks?: Json | null
          circle_cx?: number | null
          circle_cy?: number | null
          circle_r?: number | null
          created_at?: string
          created_by?: string
          eye?: string
          flash_used?: boolean | null
          glare_fraction?: number | null
          guide_box?: Json | null
          id?: string
          lighting?: string | null
          notes?: string | null
          patient_id?: string
          phone_model?: string | null
          pupil_circle_confirmed?: boolean
          pupil_roi_path?: string | null
          quality_status?: string | null
          roi_storage_path?: string | null
          storage_path?: string
          visual_acuity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eye_images_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number | null
          area: string | null
          consent_given: boolean
          consent_photo_path: string | null
          consent_type: string | null
          created_at: string
          created_by: string
          id: string
          screening_date: string
          sex: string | null
          site_id: string | null
          study_id: string
        }
        Insert: {
          age?: number | null
          area?: string | null
          consent_given: boolean
          consent_photo_path?: string | null
          consent_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          screening_date?: string
          sex?: string | null
          site_id?: string | null
          study_id?: string
        }
        Update: {
          age?: number | null
          area?: string | null
          consent_given?: boolean
          consent_photo_path?: string | null
          consent_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          screening_date?: string
          sex?: string | null
          site_id?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comments: string | null
          confidence: number | null
          created_at: string
          diagnosis: string
          doctor_id: string
          eye_image_id: string
          id: string
          other_text: string | null
          referral: boolean | null
        }
        Insert: {
          comments?: string | null
          confidence?: number | null
          created_at?: string
          diagnosis: string
          doctor_id?: string
          eye_image_id: string
          id?: string
          other_text?: string | null
          referral?: boolean | null
        }
        Update: {
          comments?: string | null
          confidence?: number | null
          created_at?: string
          diagnosis?: string
          doctor_id?: string
          eye_image_id?: string
          id?: string
          other_text?: string | null
          referral?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_eye_image_id_fkey"
            columns: ["eye_image_id"]
            isOneToOne: false
            referencedRelation: "eye_images"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          model_url: string
          updated_at: string
        }
        Insert: {
          key: string
          model_url?: string
          updated_at?: string
        }
        Update: {
          key?: string
          model_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "health_worker" | "doctor"
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
    Enums: {
      app_role: ["admin", "health_worker", "doctor"],
    },
  },
} as const
