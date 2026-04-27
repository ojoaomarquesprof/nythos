// ============================================================
// Nythos — Database Types (mirrors Supabase schema)
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
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
          session_duration_default: number;
          session_price_default: number;
          push_subscription: Json | null;
          biometric_credential_id: string | null;
          timezone: string;
          created_at: string;
          updated_at: string;
          signature_url: string | null;
          cpf: string | null;
          rg: string | null;
          address: string | null;
        };
        Insert: {
          id: string;
          full_name?: string;
          crp?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          clinic_logo_url?: string | null;
          clinic_name?: string | null;
          session_duration_default?: number;
          session_price_default?: number;
          push_subscription?: Json | null;
          biometric_credential_id?: string | null;
          timezone?: string;
          signature_url?: string | null;
          cpf?: string | null;
          rg?: string | null;
          address?: string | null;
        };
        Update: {
          full_name?: string;
          crp?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          clinic_logo_url?: string | null;
          clinic_name?: string | null;
          session_duration_default?: number;
          session_price_default?: number;
          push_subscription?: Json | null;
          biometric_credential_id?: string | null;
          timezone?: string;
          signature_url?: string | null;
          cpf?: string | null;
          rg?: string | null;
          address?: string | null;
        };
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
          gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          address: string | null;
          notes_encrypted: string | null;
          diagnosis_encrypted: string | null;
          status: 'active' | 'inactive' | 'archived';
          session_price: number | null;
          insurance_provider: string | null;
          insurance_number: string | null;
          access_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          date_of_birth?: string | null;
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          address?: string | null;
          notes_encrypted?: string | null;
          diagnosis_encrypted?: string | null;
          status?: 'active' | 'inactive' | 'archived';
          session_price?: number | null;
          insurance_provider?: string | null;
          insurance_number?: string | null;
        };
        Update: {
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          cpf?: string | null;
          date_of_birth?: string | null;
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          address?: string | null;
          notes_encrypted?: string | null;
          diagnosis_encrypted?: string | null;
          status?: 'active' | 'inactive' | 'archived';
          session_price?: number | null;
          insurance_provider?: string | null;
          insurance_number?: string | null;
        };
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          scheduled_at: string;
          duration_minutes: number;
          status: 'scheduled' | 'completed' | 'missed' | 'cancelled';
          session_type: 'individual' | 'couple' | 'group' | 'online' | 'initial_assessment';
          session_notes_encrypted: string | null;
          session_price: number | null;
          location: string;
          is_recurring: boolean;
          recurrence_rule: string | null;
          reminder_sent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id: string;
          scheduled_at: string;
          duration_minutes?: number;
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled';
          session_type?: 'individual' | 'couple' | 'group' | 'online' | 'initial_assessment';
          session_notes_encrypted?: string | null;
          session_price?: number | null;
          location?: string;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
        };
        Update: {
          patient_id?: string;
          scheduled_at?: string;
          duration_minutes?: number;
          status?: 'scheduled' | 'completed' | 'missed' | 'cancelled';
          session_type?: 'individual' | 'couple' | 'group' | 'online' | 'initial_assessment';
          session_notes_encrypted?: string | null;
          session_price?: number | null;
          location?: string;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          reminder_sent?: boolean;
        };
      };
      cash_flow: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          type: 'income' | 'expense';
          amount: number;
          description: string;
          category: string;
          status: 'pending' | 'confirmed' | 'cancelled';
          due_date: string | null;
          paid_at: string | null;
          payment_method: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other' | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          type: 'income' | 'expense';
          amount: number;
          description: string;
          category?: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other' | null;
          notes?: string | null;
        };
        Update: {
          type?: 'income' | 'expense';
          amount?: number;
          description?: string;
          category?: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other' | null;
          notes?: string | null;
        };
      };
      patient_tasks: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          title: string;
          description: string | null;
          category: 'general' | 'homework' | 'reading' | 'exercise' | 'reflection' | 'behavior_tracking';
          due_date: string | null;
          status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          priority: 'low' | 'medium' | 'high';
          completed_at: string | null;
          therapist_notes: string | null;
          patient_feedback: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_id: string;
          title: string;
          description?: string | null;
          category?: 'general' | 'homework' | 'reading' | 'exercise' | 'reflection' | 'behavior_tracking';
          due_date?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          priority?: 'low' | 'medium' | 'high';
          therapist_notes?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          category?: 'general' | 'homework' | 'reading' | 'exercise' | 'reflection' | 'behavior_tracking';
          due_date?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          priority?: 'low' | 'medium' | 'high';
          completed_at?: string | null;
          therapist_notes?: string | null;
          patient_feedback?: string | null;
        };
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
          context: 'morning' | 'afternoon' | 'evening' | 'night' | 'work' | 'home' | 'social' | 'other' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          emotion: string;
          intensity: number;
          notes?: string | null;
          triggers?: string | null;
          coping_strategy?: string | null;
          context?: 'morning' | 'afternoon' | 'evening' | 'night' | 'work' | 'home' | 'social' | 'other' | null;
        };
        Update: {
          emotion?: string;
          intensity?: number;
          notes?: string | null;
          triggers?: string | null;
          coping_strategy?: string | null;
          context?: 'morning' | 'afternoon' | 'evening' | 'night' | 'work' | 'home' | 'social' | 'other' | null;
        };
      };
      anamnesis_templates: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          fields: Json;
          created_at: string;
          updated_at: string;
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
        };
      };
      anamnesis_responses: {
        Row: {
          id: string;
          template_id: string;
          patient_id: string | null;
          responses: Json;
          status: 'pending' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          patient_id?: string | null;
          responses?: Json;
          status?: 'pending' | 'completed';
        };
        Update: {
          responses?: Json;
          status?: 'pending' | 'completed';
        };
      };
    };
    Views: {
      monthly_financial_summary: {
        Row: {
          user_id: string;
          month: string;
          total_income: number;
          total_expenses: number;
          net_profit: number;
          pending_payments: number;
        };
      };
    };
  };
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Patient = Database['public']['Tables']['patients']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type CashFlow = Database['public']['Tables']['cash_flow']['Row'];
export type PatientTask = Database['public']['Tables']['patient_tasks']['Row'];
export type EmotionDiary = Database['public']['Tables']['emotion_diary']['Row'];
export type AnamnesisTemplate = Database['public']['Tables']['anamnesis_templates']['Row'];
export type AnamnesisResponse = Database['public']['Tables']['anamnesis_responses']['Row'];

export type SessionStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled';
export type SessionType = 'individual' | 'couple' | 'group' | 'online' | 'initial_assessment';
export type CashFlowType = 'income' | 'expense';
export type CashFlowStatus = 'pending' | 'confirmed' | 'cancelled';
export type PatientStatus = 'active' | 'inactive' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
