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
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
        ]
      }
      eye_images: {
        Row: {
          blur_score: number | null
          brightness: number | null
          capture_checks: Json | null
          circle_cx: number | null
          circle_cy: number | null
          circle_method: string | null
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
          thumb_path: string | null
          visual_acuity: string | null
        }
        Insert: {
          blur_score?: number | null
          brightness?: number | null
          capture_checks?: Json | null
          circle_cx?: number | null
          circle_cy?: number | null
          circle_method?: string | null
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
          thumb_path?: string | null
          visual_acuity?: string | null
        }
        Update: {
          blur_score?: number | null
          brightness?: number | null
          capture_checks?: Json | null
          circle_cx?: number | null
          circle_cy?: number | null
          circle_method?: string | null
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
          thumb_path?: string | null
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
      hospitals: {
        Row: {
          active: boolean
          address_bn: string | null
          address_en: string | null
          cost_note_bn: string | null
          district: string
          division: string | null
          id: string
          name_bn: string
          name_en: string
          phone: string | null
          services: string[]
          updated_at: string
          verified: boolean
        }
        Insert: {
          active?: boolean
          address_bn?: string | null
          address_en?: string | null
          cost_note_bn?: string | null
          district: string
          division?: string | null
          id?: string
          name_bn: string
          name_en: string
          phone?: string | null
          services?: string[]
          updated_at?: string
          verified?: boolean
        }
        Update: {
          active?: boolean
          address_bn?: string | null
          address_en?: string | null
          cost_note_bn?: string | null
          district?: string
          division?: string | null
          id?: string
          name_bn?: string
          name_en?: string
          phone?: string | null
          services?: string[]
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
        ]
      }
      model_runs: {
        Row: {
          active: boolean
          created_at: string
          data_hash: string | null
          git_commit: string | null
          id: string
          input_spec: string
          metrics: Json | null
          model_url: string
          notes: string | null
          review_threshold: number | null
          threshold: number
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          data_hash?: string | null
          git_commit?: string | null
          id?: string
          input_spec?: string
          metrics?: Json | null
          model_url: string
          notes?: string | null
          review_threshold?: number | null
          threshold: number
          version: string
        }
        Update: {
          active?: boolean
          created_at?: string
          data_hash?: string | null
          git_commit?: string | null
          id?: string
          input_spec?: string
          metrics?: Json | null
          model_url?: string
          notes?: string | null
          review_threshold?: number | null
          threshold?: number
          version?: string
        }
        Relationships: [
        ]
      }
      patient_contacts: {
        Row: {
          address: string | null
          contact_consent: boolean
          created_at: string
          created_by: string
          full_name: string
          patient_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_consent?: boolean
          created_at?: string
          created_by?: string
          full_name: string
          patient_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_consent?: boolean
          created_at?: string
          created_by?: string
          full_name?: string
          patient_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
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
          district: string | null
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
          district?: string | null
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
          district?: string | null
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
      predictions: {
        Row: {
          band: string
          created_at: string
          created_by: string
          eye_image_id: string
          id: string
          inference_ms: number | null
          model_run_id: string | null
          model_url: string
          positive: boolean
          score: number
          threshold: number
        }
        Insert: {
          band?: string
          created_at?: string
          created_by?: string
          eye_image_id: string
          id?: string
          inference_ms?: number | null
          model_run_id?: string | null
          model_url: string
          positive: boolean
          score: number
          threshold: number
        }
        Update: {
          band?: string
          created_at?: string
          created_by?: string
          eye_image_id?: string
          id?: string
          inference_ms?: number | null
          model_run_id?: string | null
          model_url?: string
          positive?: boolean
          score?: number
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "predictions_eye_image_id_fkey"
            columns: ["eye_image_id"]
            isOneToOne: false
            referencedRelation: "eye_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "model_runs"
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
          notify_sms: boolean
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          notify_sms?: boolean
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notify_sms?: boolean
          phone?: string | null
        }
        Relationships: [
        ]
      }
      referrals: {
        Row: {
          ai_band: string | null
          audit_p: number | null
          audit_sampled: boolean
          created_at: string
          created_by: string | null
          doctor_id: string | null
          doctor_note: string | null
          hospital_id: string | null
          id: string
          informed_at: string | null
          outcome_at: string | null
          patient_id: string
          patient_visible: boolean
          priority: string
          priority_rank: number | null
          reason: string
          referral_type: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_band?: string | null
          audit_p?: number | null
          audit_sampled?: boolean
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          doctor_note?: string | null
          hospital_id?: string | null
          id?: string
          informed_at?: string | null
          outcome_at?: string | null
          patient_id: string
          patient_visible?: boolean
          priority?: string
          reason: string
          referral_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_band?: string | null
          audit_p?: number | null
          audit_sampled?: boolean
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          doctor_note?: string | null
          hospital_id?: string | null
          id?: string
          informed_at?: string | null
          outcome_at?: string | null
          patient_id?: string
          patient_visible?: boolean
          priority?: string
          reason?: string
          referral_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          blinded: boolean
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
          blinded?: boolean
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
          blinded?: boolean
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
      screening_config: {
        Row: {
          audit_rate: number
          id: number
          updated_at: string
        }
        Insert: {
          audit_rate?: number
          id?: number
          updated_at?: string
        }
        Update: {
          audit_rate?: number
          id?: number
          updated_at?: string
        }
        Relationships: [
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
        Relationships: [
        ]
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
        Relationships: [
        ]
      }
      sms_log: {
        Row: {
          created_at: string
          id: string
          phone_last4: string | null
          provider_response: string | null
          recipient: string
          recipient_user: string | null
          referral_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_last4?: string | null
          provider_response?: string | null
          recipient: string
          recipient_user?: string | null
          referral_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_last4?: string | null
          provider_response?: string | null
          recipient?: string
          recipient_user?: string | null
          referral_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
        ]
      }
      vision_tests: {
        Row: {
          contrast_log_cs: number | null
          created_at: string
          created_by: string
          distance_m: number
          eye: string
          id: string
          logmar: number | null
          method: string
          patient_id: string
          pinhole_improves: boolean | null
          px_per_mm: number | null
          snellen: string | null
        }
        Insert: {
          contrast_log_cs?: number | null
          created_at?: string
          created_by?: string
          distance_m: number
          eye: string
          id?: string
          logmar?: number | null
          method?: string
          patient_id: string
          pinhole_improves?: boolean | null
          px_per_mm?: number | null
          snellen?: string | null
        }
        Update: {
          contrast_log_cs?: number | null
          created_at?: string
          created_by?: string
          distance_m?: number
          eye?: string
          id?: string
          logmar?: number | null
          method?: string
          patient_id?: string
          pinhole_improves?: boolean | null
          px_per_mm?: number | null
          snellen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vision_tests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_stats: { Args: never; Returns: Json }
      referral_stats: { Args: never; Returns: Json }
      field_referral: { Args: { _patient: string; _reason: string; _type: string; _priority: string }; Returns: undefined }
      review_queue: { Args: { _limit?: number }; Returns: { id: string; eye: string; storage_path: string; pupil_roi_path: string | null; pupil_circle_confirmed: boolean; circle_cx: number | null; circle_cy: number | null; circle_r: number | null; study_id: string; age: number | null; sex: string | null; priority: string | null; referral_status: string | null; pending_referrals: number }[] }
      grading_queue: { Args: { _limit?: number }; Returns: { id: string; eye: string; storage_path: string; pupil_roi_path: string | null; pupil_circle_confirmed: boolean; circle_cx: number | null; circle_cy: number | null; circle_r: number | null; study_id: string; age: number | null; sex: string | null; remaining: number }[] }
      audit_sensitivity: { Args: { _blinded_only?: boolean }; Returns: Json }
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
