// ============================================================
// Nythos — Database Type Definitions
// Introspected from live Supabase schema (project: ubgjaiqimaklvvzqtqwu)
// Last updated: 2026-05-08
//
// Structure matches @supabase/supabase-js@2.104.0 / @supabase/postgrest-js@2.104.0
// which requires:
//   - __InternalSupabase.PostgrestVersion to set the Postgrest API version
//   - Each table entry must have: Row, Insert, Update, Relationships
//   - Relationships must be a typed array (use never[] for no FKs)
//
// To regenerate (requires Supabase Personal Access Token sbp_...):
//   SUPABASE_ACCESS_TOKEN=sbp_... npx supabase gen types typescript \
//     --project-id ubgjaiqimaklvvzqtqwu > src/types/database.ts
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          crp: string | null;
          phone: string | null;
          avatar_url: string | null;
          clinic_logo_url: string | null;
          clinic_name: string | null;
          session_duration_default: number | null;
          session_price_default: number | null;
          push_subscription: Json | null;
          biometric_credential_id: string | null;
          timezone: string | null;
          role: string | null;
          employer_id: string | null;
          email: string | null;
          created_at: string | null;
          updated_at: string | null;
          address: string | null;
          rg: string | null;
          signature_url: string | null;
          cpf: string | null;
          google_access_token: string | null;
          google_refresh_token: string | null;
          google_token_expiry: string | null;
          google_calendar_id: string | null;
        };
        Insert: {
          id: string;
          full_name?: string;
          crp?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          clinic_logo_url?: string | null;
          clinic_name?: string | null;
          session_duration_default?: number | null;
          session_price_default?: number | null;
          push_subscription?: Json | null;
          biometric_credential_id?: string | null;
          timezone?: string | null;
          role?: string | null;
          employer_id?: string | null;
          email?: string | null;
          address?: string | null;
          rg?: string | null;
          signature_url?: string | null;
          cpf?: string | null;
          google_access_token?: string | null;
          google_refresh_token?: string | null;
          google_token_expiry?: string | null;
          google_calendar_id?: string | null;
        };
        Update: {
          full_name?: string;
          crp?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          clinic_logo_url?: string | null;
          clinic_name?: string | null;
          session_duration_default?: number | null;
          session_price_default?: number | null;
          push_subscription?: Json | null;
          biometric_credential_id?: string | null;
          timezone?: string | null;
          role?: string | null;
          employer_id?: string | null;
          email?: string | null;
          address?: string | null;
          rg?: string | null;
          signature_url?: string | null;
          cpf?: string | null;
          google_access_token?: string | null;
          google_refresh_token?: string | null;
          google_token_expiry?: string | null;
          google_calendar_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      patients: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          cpf: string | null;
          date_of_birth: string | null;
          gender: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          address: string | null;
          notes_encrypted: string | null;
          diagnosis_encrypted: string | null;
          status: string;
          session_price: number | null;
          insurance_provider: string | null;
          insurance_number: string | null;
          access_token: string;
          access_token_expires_at: string | null;
          access_token_issued_at: string | null;
          access_token_last_used_at: string | null;
          access_token_revoked_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          auth_user_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          address?: string | null;
          notes_encrypted?: string | null;
          diagnosis_encrypted?: string | null;
          status?: string;
          session_price?: number | null;
          insurance_provider?: string | null;
          insurance_number?: string | null;
          access_token?: string;
          access_token_expires_at?: string | null;
          access_token_issued_at?: string | null;
          access_token_last_used_at?: string | null;
          access_token_revoked_at?: string | null;
          auth_user_id?: string | null;
        };
        Update: {
          user_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          address?: string | null;
          notes_encrypted?: string | null;
          diagnosis_encrypted?: string | null;
          status?: string;
          session_price?: number | null;
          insurance_provider?: string | null;
          insurance_number?: string | null;
          access_token?: string;
          access_token_expires_at?: string | null;
          access_token_issued_at?: string | null;
          access_token_last_used_at?: string | null;
          access_token_revoked_at?: string | null;
          auth_user_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      session_packages: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          guardian_id: string | null;
          name: string;
          total_sessions: number;
          total_amount: number;
          unit_amount: number;
          status: string;
          payment_status: string;
          start_date: string;
          expires_at: string | null;
          allow_use_before_payment: boolean;
          created_by: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id: string;
          guardian_id?: string | null;
          name: string;
          total_sessions: number;
          total_amount: number;
          unit_amount: number;
          status?: string;
          payment_status?: string;
          start_date?: string;
          expires_at?: string | null;
          allow_use_before_payment?: boolean;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          patient_id?: string;
          guardian_id?: string | null;
          name?: string;
          total_sessions?: number;
          total_amount?: number;
          unit_amount?: number;
          status?: string;
          payment_status?: string;
          start_date?: string;
          expires_at?: string | null;
          allow_use_before_payment?: boolean;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      sessions: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          scheduled_at: string;
          duration_minutes: number | null;
          status: string;
          completed_at: string | null;
          session_type: string | null;
          session_notes_encrypted: string | null;
          session_price: number | null;
          location: string | null;
          is_recurring: boolean | null;
          recurrence_rule: string | null;
          reminder_sent: boolean | null;
          billing_mode: string;
          package_id: string | null;
          google_event_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id: string;
          scheduled_at: string;
          duration_minutes?: number | null;
          status?: string;
          completed_at?: string | null;
          session_type?: string | null;
          session_notes_encrypted?: string | null;
          session_price?: number | null;
          location?: string | null;
          is_recurring?: boolean | null;
          recurrence_rule?: string | null;
          reminder_sent?: boolean | null;
          billing_mode?: string;
          package_id?: string | null;
          google_event_id?: string | null;
        };
        Update: {
          patient_id?: string;
          scheduled_at?: string;
          duration_minutes?: number | null;
          status?: string;
          completed_at?: string | null;
          session_type?: string | null;
          session_notes_encrypted?: string | null;
          session_price?: number | null;
          location?: string | null;
          is_recurring?: boolean | null;
          recurrence_rule?: string | null;
          reminder_sent?: boolean | null;
          billing_mode?: string;
          package_id?: string | null;
          google_event_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      external_calendar_events: {
        Row: {
          id: string;
          user_id: string;
          google_event_id: string;
          calendar_id: string;
          title: string | null;
          description: string | null;
          location: string | null;
          starts_at: string;
          ends_at: string;
          is_all_day: boolean;
          html_link: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          google_event_id: string;
          calendar_id?: string;
          title?: string | null;
          description?: string | null;
          location?: string | null;
          starts_at: string;
          ends_at: string;
          is_all_day?: boolean;
          html_link?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          google_event_id?: string;
          calendar_id?: string;
          title?: string | null;
          description?: string | null;
          location?: string | null;
          starts_at?: string;
          ends_at?: string;
          is_all_day?: boolean;
          html_link?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          plan_id: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          plan_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          status?: string;
          plan_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      cash_flow: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string | null;
          session_id: string | null;
          package_id: string | null;
          type: string;
          amount: number;
          description: string;
          category: string | null;
          status: string;
          due_date: string | null;
          paid_at: string | null;
          payment_method: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          guardian_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id?: string | null;
          session_id?: string | null;
          package_id?: string | null;
          type: string;
          amount: number;
          description: string;
          category?: string | null;
          status?: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          notes?: string | null;
          guardian_id?: string | null;
        };
        Update: {
          patient_id?: string | null;
          session_id?: string | null;
          package_id?: string | null;
          type?: string;
          amount?: number;
          description?: string;
          category?: string | null;
          status?: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          notes?: string | null;
          guardian_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      session_package_usages: {
        Row: {
          id: string;
          package_id: string;
          session_id: string | null;
          status: string;
          usage_type: string;
          used_at: string | null;
          used_by: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          package_id: string;
          session_id?: string | null;
          status?: string;
          usage_type?: string;
          used_at?: string | null;
          used_by?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
          created_at?: string | null;
        };
        Update: {
          package_id?: string;
          session_id?: string | null;
          status?: string;
          usage_type?: string;
          used_at?: string | null;
          used_by?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
        };
        Relationships: never[];
      };

      patient_tasks: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          title: string;
          description: string | null;
          category: string | null;
          due_date: string | null;
          status: string;
          priority: string | null;
          completed_at: string | null;
          responded_at: string | null;
          viewed_at: string | null;
          therapist_notes: string | null;
          patient_feedback: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id: string;
          title: string;
          description?: string | null;
          category?: string | null;
          due_date?: string | null;
          status?: string;
          priority?: string | null;
          therapist_notes?: string | null;
          patient_feedback?: string | null;
          responded_at?: string | null;
          viewed_at?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          category?: string | null;
          due_date?: string | null;
          status?: string;
          priority?: string | null;
          completed_at?: string | null;
          responded_at?: string | null;
          viewed_at?: string | null;
          therapist_notes?: string | null;
          patient_feedback?: string | null;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      emotion_diary: {
        Row: {
          id: string;
          patient_id: string;
          emotion: string;
          intensity: number;
          notes: string | null;
          triggers: string | null;
          coping_strategy: string | null;
          context: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          patient_id: string;
          emotion: string;
          intensity: number;
          notes?: string | null;
          triggers?: string | null;
          coping_strategy?: string | null;
          context?: string | null;
        };
        Update: {
          emotion?: string;
          intensity?: number;
          notes?: string | null;
          triggers?: string | null;
          coping_strategy?: string | null;
          context?: string | null;
        };
        Relationships: never[];
      };

      anamnesis_templates: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          fields: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          fields?: Json;
        };
        Update: {
          title?: string;
          description?: string | null;
          fields?: Json;
          updated_at?: string | null;
        };
        Relationships: never[];
      };

      anamnesis_responses: {
        Row: {
          id: string;
          template_id: string;
          patient_id: string;
          data: Json;
          responses: Json;
          public_token: string | null;
          public_expires_at: string | null;
          public_last_used_at: string | null;
          public_revoked_at: string | null;
          status: string | null;
          completed_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          patient_id: string;
          data?: Json;
          responses?: Json;
          public_token?: string | null;
          public_expires_at?: string | null;
          public_last_used_at?: string | null;
          public_revoked_at?: string | null;
          status?: string | null;
        };
        Update: {
          data?: Json;
          responses?: Json;
          public_token?: string | null;
          public_expires_at?: string | null;
          public_last_used_at?: string | null;
          public_revoked_at?: string | null;
          status?: string | null;
          completed_at?: string | null;
        };
        Relationships: never[];
      };

      system_settings: {
        Row: {
          key: string;
          value: string;
          description: string | null;
          updated_at: string | null;
        };
        Insert: { key: string; value: string; description?: string | null };
        Update: { value?: string; description?: string | null };
        Relationships: never[];
      };

      patient_evaluations: {
        Row: { id: string; [key: string]: unknown };
        Insert: { [key: string]: unknown };
        Update: { [key: string]: unknown };
        Relationships: never[];
      };

      patient_neuro_profiles: {
        Row: { id: string; [key: string]: unknown };
        Insert: { [key: string]: unknown };
        Update: { [key: string]: unknown };
        Relationships: never[];
      };

      abc_records: {
        Row: { id: string; [key: string]: unknown };
        Insert: { [key: string]: unknown };
        Update: { [key: string]: unknown };
        Relationships: never[];
      };

      care_network: {
        Row: { id: string; [key: string]: unknown };
        Insert: { [key: string]: unknown };
        Update: { [key: string]: unknown };
        Relationships: never[];
      };

      patient_guardians: {
        Row: { id: string; [key: string]: unknown };
        Insert: { [key: string]: unknown };
        Update: { [key: string]: unknown };
        Relationships: never[];
      };

      patient_treatment_plans: {
        Row: {
          id: string;
          patient_id: string;
          therapist_id: string;
          main_goal_encrypted: string;
          current_focus_encrypted: string;
          strategies_encrypted: string | null;
          review_date: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          therapist_id: string;
          main_goal_encrypted: string;
          current_focus_encrypted: string;
          strategies_encrypted?: string | null;
          review_date?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          patient_id?: string;
          therapist_id?: string;
          main_goal_encrypted?: string;
          current_focus_encrypted?: string;
          strategies_encrypted?: string | null;
          review_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };

      patient_treatment_goals: {
        Row: {
          id: string;
          treatment_plan_id: string;
          patient_id: string;
          therapist_id: string;
          title_encrypted: string;
          description_encrypted: string | null;
          status: string;
          target_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          treatment_plan_id: string;
          patient_id: string;
          therapist_id: string;
          title_encrypted: string;
          description_encrypted?: string | null;
          status?: string;
          target_date?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          treatment_plan_id?: string;
          patient_id?: string;
          therapist_id?: string;
          title_encrypted?: string;
          description_encrypted?: string | null;
          status?: string;
          target_date?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };

      patient_mood_checkins: {
        Row: {
          id: string;
          patient_id: string;
          therapist_id: string;
          mood_score: number | null;
          anxiety_score: number | null;
          sleep_quality: number | null;
          energy_score: number | null;
          notes_encrypted: string | null;
          notes?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          therapist_id: string;
          mood_score?: number | null;
          anxiety_score?: number | null;
          sleep_quality?: number | null;
          energy_score?: number | null;
          notes_encrypted?: string | null;
          created_at?: string;
        };
        Update: {
          patient_id?: string;
          therapist_id?: string;
          mood_score?: number | null;
          anxiety_score?: number | null;
          sleep_quality?: number | null;
          energy_score?: number | null;
          notes_encrypted?: string | null;
        };
        Relationships: never[];
      };

      patient_documents: {
        Row: {
          id: string;
          patient_id: string;
          therapist_id: string;
          category: string;
          title: string;
          description_encrypted: string | null;
          description?: string | null;
          has_file?: boolean;
          storage_path: string | null;
          file_name: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          document_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          therapist_id: string;
          category?: string;
          title: string;
          description_encrypted?: string | null;
          storage_path?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          document_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          patient_id?: string;
          therapist_id?: string;
          category?: string;
          title?: string;
          description_encrypted?: string | null;
          storage_path?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          document_date?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };

      patient_consents: {
        Row: {
          id: string;
          patient_id: string;
          therapist_id: string;
          consent_type: string;
          status: string;
          signed_at: string | null;
          expires_at: string | null;
          related_person_name: string | null;
          document_file_id: string | null;
          version: string | null;
          notes_encrypted: string | null;
          notes?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          therapist_id: string;
          consent_type?: string;
          status?: string;
          signed_at?: string | null;
          expires_at?: string | null;
          related_person_name?: string | null;
          document_file_id?: string | null;
          version?: string | null;
          notes_encrypted?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          patient_id?: string;
          therapist_id?: string;
          consent_type?: string;
          status?: string;
          signed_at?: string | null;
          expires_at?: string | null;
          related_person_name?: string | null;
          document_file_id?: string | null;
          version?: string | null;
          notes_encrypted?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
    };

    Views: {
      monthly_financial_summary: {
        Row: {
          user_id: string | null;
          month: string | null;
          total_income: number | null;
          total_expenses: number | null;
          net_profit: number | null;
          pending_payments: number | null;
        };
        Relationships: never[];
      };
    };

    Functions: {
      encrypt_google_token_if_needed: {
        Args: { p_token: string };
        Returns: string;
      };
      decrypt_google_token_if_needed: {
        Args: { p_token: string };
        Returns: string;
      };
      revoke_patient_access_link_secure: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      regenerate_patient_access_link_secure: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_schedule_sessions_with_evolution_status: {
        Args: {
          p_therapist_id: string;
          p_starts_at: string;
          p_ends_at: string;
        };
        Returns: Json;
      };
      get_patient_sessions_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_evaluations_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      append_patient_clinical_note: {
        Args: { p_patient_id: string; p_note: string };
        Returns: Json;
      };
      update_session_evolution_secure: {
        Args: {
          p_session_id: string;
          p_notes: string;
          p_mood_happy_sad: number;
          p_mood_anxious_calm: number;
        };
        Returns: Json;
      };
      create_patient_evaluation_secure: {
        Args: {
          p_patient_id: string;
          p_protocol_name: string;
          p_evaluation_date: string;
          p_score?: string | null;
          p_status?: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      get_public_anamnesis_response: {
        Args: { p_public_token: string };
        Returns: Json;
      };
      submit_public_anamnesis_response: {
        Args: { p_public_token: string; p_responses: Json };
        Returns: Json;
      };
      revoke_public_anamnesis_link_secure: {
        Args: { p_response_id: string };
        Returns: Json;
      };
      regenerate_public_anamnesis_link_secure: {
        Args: { p_response_id: string };
        Returns: Json;
      };
      create_anamnesis_request_secure: {
        Args: { p_patient_id: string; p_template_id: string };
        Returns: Json;
      };
      get_patient_tasks_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_emotion_diary_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_mood_checkins_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      create_patient_mood_checkin_secure: {
        Args: {
          p_patient_id: string;
          p_mood_score?: number | null;
          p_anxiety_score?: number | null;
          p_sleep_quality?: number | null;
          p_energy_score?: number | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      get_patient_portal_tasks_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_portal_emotion_diary_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_portal_mood_checkins_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      get_patient_treatment_plan_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      upsert_patient_treatment_plan_secure: {
        Args: {
          p_patient_id: string;
          p_main_goal: string;
          p_current_focus: string;
          p_strategies?: string | null;
          p_review_date?: string | null;
          p_status?: string;
        };
        Returns: Json;
      };
      create_patient_treatment_goal_secure: {
        Args: {
          p_patient_id: string;
          p_title: string;
          p_description?: string | null;
          p_status?: string;
          p_target_date?: string | null;
        };
        Returns: Json;
      };
      update_patient_treatment_goal_secure: {
        Args: {
          p_goal_id: string;
          p_title: string;
          p_description?: string | null;
          p_status?: string;
          p_target_date?: string | null;
        };
        Returns: Json;
      };
      get_patient_care_network_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      create_patient_support_contact_secure: {
        Args: {
          p_patient_id: string;
          p_name: string;
          p_contact_type?: string;
          p_relationship?: string | null;
          p_specialty?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
          p_organization?: string | null;
          p_notes?: string | null;
          p_can_contact?: boolean;
          p_consent_date?: string | null;
          p_is_primary?: boolean;
          p_is_active?: boolean;
        };
        Returns: Json;
      };
      delete_patient_support_contact_secure: {
        Args: { p_contact_id: string };
        Returns: Json;
      };
      get_patient_consents_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      create_patient_consent_secure: {
        Args: {
          p_patient_id: string;
          p_consent_type: string;
          p_status?: string;
          p_signed_at?: string | null;
          p_expires_at?: string | null;
          p_related_person_name?: string | null;
          p_document_file_id?: string | null;
          p_version?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      delete_patient_consent_secure: {
        Args: { p_consent_id: string };
        Returns: Json;
      };
      get_patient_documents_decrypted: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      create_patient_document_secure: {
        Args: {
          p_patient_id: string;
          p_category: string;
          p_title: string;
          p_description?: string | null;
          p_storage_path?: string | null;
          p_file_name?: string | null;
          p_mime_type?: string | null;
          p_size_bytes?: number | null;
          p_document_date?: string | null;
        };
        Returns: Json;
      };
      delete_patient_document_secure: {
        Args: { p_document_id: string };
        Returns: Json;
      };
      current_professional_can_manage_financial_patient: {
        Args: { p_patient_id: string };
        Returns: boolean;
      };
      create_session_package_with_billing: {
        Args: {
          p_patient_id: string;
          p_name: string;
          p_total_sessions: number;
          p_total_amount: number;
          p_start_date?: string | null;
          p_expires_at?: string | null;
          p_guardian_id?: string | null;
          p_allow_use_before_payment?: boolean;
        };
        Returns: Json;
      };
      get_patient_session_packages: {
        Args: { p_patient_id: string };
        Returns: Json;
      };
      update_session_package_secure: {
        Args: {
          p_package_id: string;
          p_patch: Json;
        };
        Returns: Json;
      };
      set_session_package_status_secure: {
        Args: {
          p_package_id: string;
          p_status: string;
        };
        Returns: Json;
      };
    };
  };
};

// ─── Convenience Row Types ───────────────────────────────────────────────────
export type Profile            = Database['public']['Tables']['profiles']['Row'];
export type Patient            = Database['public']['Tables']['patients']['Row'];
export type SessionPackage     = Database['public']['Tables']['session_packages']['Row'];
export type SessionPackageUsage = Database['public']['Tables']['session_package_usages']['Row'];
export type Session            = Database['public']['Tables']['sessions']['Row'];
export type ExternalCalendarEvent = Database['public']['Tables']['external_calendar_events']['Row'];
export type Subscription       = Database['public']['Tables']['subscriptions']['Row'];
export type CashFlow           = Database['public']['Tables']['cash_flow']['Row'];
export type PatientTask        = Database['public']['Tables']['patient_tasks']['Row'];
export type EmotionDiary       = Database['public']['Tables']['emotion_diary']['Row'];
export type AnamnesisTemplate  = Database['public']['Tables']['anamnesis_templates']['Row'];
export type AnamnesisResponse  = Database['public']['Tables']['anamnesis_responses']['Row'];
export type SystemSetting      = Database['public']['Tables']['system_settings']['Row'];
export type PatientTreatmentPlanStatus = 'active' | 'paused' | 'completed' | 'archived';
export type PatientTreatmentGoalStatus = 'active' | 'in_progress' | 'completed' | 'paused';
export type PatientTreatmentGoal = Database['public']['Tables']['patient_treatment_goals']['Row'] & {
  title: string;
  description: string | null;
};
export type PatientTreatmentPlan = Database['public']['Tables']['patient_treatment_plans']['Row'] & {
  main_goal: string;
  current_focus: string;
  strategies: string | null;
  goals: PatientTreatmentGoal[];
};
export type PatientMoodCheckin = Database['public']['Tables']['patient_mood_checkins']['Row'] & {
  notes: string | null;
};
export type SupportContact = Database['public']['Tables']['care_network']['Row'] & {
  name: string;
  specialty: string | null;
  contact_type: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  organization: string | null;
  notes: string | null;
  can_contact: boolean | null;
  consent_date: string | null;
  is_primary: boolean | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
};
export type PatientConsent = Database['public']['Tables']['patient_consents']['Row'] & {
  notes: string | null;
};
export type PatientDocument = Database['public']['Tables']['patient_documents']['Row'] & {
  description: string | null;
};
export type SessionPackageWithBalance = SessionPackage & {
  used_sessions: number;
  remaining_sessions: number;
  reserved_sessions?: number;
  reservable_sessions?: number;
  cash_flow_id: string | null;
  cash_flow_status: CashFlowStatus | null;
  cash_flow_due_date: string | null;
  cash_flow_paid_at: string | null;
  amount_paid: number;
  amount_pending: number;
  warning?: string | null;
};

// ─── Convenience Insert/Update Types ────────────────────────────────────────
export type ProfileInsert  = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate  = Database['public']['Tables']['profiles']['Update'];
export type PatientInsert  = Database['public']['Tables']['patients']['Insert'];
export type PatientUpdate  = Database['public']['Tables']['patients']['Update'];
export type SessionPackageInsert = Database['public']['Tables']['session_packages']['Insert'];
export type SessionPackageUpdate = Database['public']['Tables']['session_packages']['Update'];
export type SessionPackageUsageInsert = Database['public']['Tables']['session_package_usages']['Insert'];
export type SessionPackageUsageUpdate = Database['public']['Tables']['session_package_usages']['Update'];
export type SessionInsert  = Database['public']['Tables']['sessions']['Insert'];
export type SessionUpdate  = Database['public']['Tables']['sessions']['Update'];
export type ExternalCalendarEventInsert = Database['public']['Tables']['external_calendar_events']['Insert'];
export type ExternalCalendarEventUpdate = Database['public']['Tables']['external_calendar_events']['Update'];
export type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert'];
export type SubscriptionUpdate = Database['public']['Tables']['subscriptions']['Update'];
export type CashFlowInsert  = Database['public']['Tables']['cash_flow']['Insert'];
export type PatientTaskInsert = Database['public']['Tables']['patient_tasks']['Insert'];
export type EmotionDiaryInsert = Database['public']['Tables']['emotion_diary']['Insert'];

// ─── Semantic Aliases ────────────────────────────────────────────────────────
export type SessionStatus  = 'scheduled' | 'completed' | 'missed' | 'cancelled';
export type SessionType    = 'individual' | 'couple' | 'group' | 'online' | 'initial_assessment';
export type SessionBillingMode = 'single' | 'free' | 'package';
export type SessionPackageStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type SessionPackageManageStatus = 'active' | 'paused' | 'cancelled';
export type SessionPackagePaymentStatus = 'pending' | 'paid' | 'partial' | 'cancelled';
export type SessionPackageUsageStatus = 'active' | 'reversed' | 'kept';
export type SessionPackageUsageType = 'completed_session' | 'no_show' | 'manual_adjustment';
export type CashFlowType   = 'income' | 'expense';
export type CashFlowStatus = 'pending' | 'confirmed' | 'cancelled';
export type PatientStatus  = 'active' | 'inactive' | 'archived';
export type TaskStatus     = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'responded' | 'viewed';
