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
      account: {
        Row: {
          cf_category: string
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_cash: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          organization_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          cf_category?: string
          code: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash?: boolean
          name: string
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          organization_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          cf_category?: string
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash?: boolean
          name?: string
          normal_balance?: Database["public"]["Enums"]["normal_balance"]
          organization_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      attachment: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          file_name: string
          id: string
          journal_entry_id: string | null
          mime_type: string
          organization_id: string
          size_bytes: number
          storage_path: string
          uploaded_by_id: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          entity_type?: string
          file_name: string
          id?: string
          journal_entry_id?: string | null
          mime_type?: string
          organization_id: string
          size_bytes?: number
          storage_path: string
          uploaded_by_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          file_name?: string
          id?: string
          journal_entry_id?: string | null
          mime_type?: string
          organization_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_event: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
          user_id: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_event_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          client_name: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_status: {
        Row: {
          company_id: string
          created_at: string
          due_date: string
          filed_at: string | null
          form: string
          id: string
          organization_id: string
          period_label: string
          proof_attachment_id: string | null
          status: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          due_date: string
          filed_at?: string | null
          form: string
          id?: string
          organization_id: string
          period_label: string
          proof_attachment_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          due_date?: string
          filed_at?: string | null
          form?: string
          id?: string
          organization_id?: string
          period_label?: string
          proof_attachment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_status_proof_attachment_id_fkey"
            columns: ["proof_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachment"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_period: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          organization_id: string
          reopened_at: string | null
          reopened_by_id: string | null
          reopened_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["fiscal_period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          organization_id: string
          reopened_at?: string | null
          reopened_by_id?: string | null
          reopened_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["fiscal_period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          organization_id?: string
          reopened_at?: string | null
          reopened_by_id?: string | null
          reopened_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["fiscal_period_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_period_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_period_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_period_reopened_by_id_fkey"
            columns: ["reopened_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch: {
        Row: {
          company_id: string
          created_at: string
          created_by_id: string
          file_name: string
          id: string
          import_type: Database["public"]["Enums"]["import_type"]
          invalid_row_count: number
          organization_id: string
          row_count: number
          status: Database["public"]["Enums"]["import_batch_status"]
          valid_row_count: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by_id: string
          file_name: string
          id?: string
          import_type: Database["public"]["Enums"]["import_type"]
          invalid_row_count?: number
          organization_id: string
          row_count?: number
          status?: Database["public"]["Enums"]["import_batch_status"]
          valid_row_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_id?: string
          file_name?: string
          id?: string
          import_type?: Database["public"]["Enums"]["import_type"]
          invalid_row_count?: number
          organization_id?: string
          row_count?: number
          status?: Database["public"]["Enums"]["import_batch_status"]
          valid_row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry: {
        Row: {
          company_id: string
          created_at: string
          created_by_id: string
          description: string
          entry_date: string
          entry_number: number | null
          entry_type: Database["public"]["Enums"]["journal_entry_type"]
          fiscal_period_id: string
          id: string
          notes: string | null
          organization_id: string
          posted_at: string | null
          posted_by_id: string | null
          reference: string
          reversal_of_id: string | null
          status: Database["public"]["Enums"]["journal_status"]
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by_id: string
          description: string
          entry_date: string
          entry_number?: number | null
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          fiscal_period_id: string
          id?: string
          notes?: string | null
          organization_id: string
          posted_at?: string | null
          posted_by_id?: string | null
          reference: string
          reversal_of_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_id?: string
          description?: string
          entry_date?: string
          entry_number?: number | null
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          fiscal_period_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by_id?: string | null
          reference?: string
          reversal_of_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_posted_by_id_fkey"
            columns: ["posted_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_sequence: {
        Row: {
          last_number: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_line: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          line_number: number
          tax_code: string | null
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_number: number
          tax_code?: string | null
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_number?: number
          tax_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_line_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_line_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
        ]
      }
      organization: {
        Row: {
          address: string | null
          branch_code: string | null
          created_at: string
          currency_code: string
          fiscal_year_start_month: number
          id: string
          legal_name: string
          name: string
          rdo: string | null
          tax_classification: string | null
          timezone: string
          tin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_code?: string | null
          created_at?: string
          currency_code?: string
          fiscal_year_start_month?: number
          id?: string
          legal_name: string
          name: string
          rdo?: string | null
          tax_classification?: string | null
          timezone?: string
          tin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_code?: string | null
          created_at?: string
          currency_code?: string
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string
          name?: string
          rdo?: string | null
          tax_classification?: string | null
          timezone?: string
          tin?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      organization_membership: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_membership_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_membership_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliation: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          created_by_id: string | null
          end_date: string
          id: string
          organization_id: string
          start_date: string
          statement_balance: number
          status: string
        }
        Insert: {
          account_id: string
          company_id?: string
          created_at?: string
          created_by_id?: string | null
          end_date: string
          id?: string
          organization_id: string
          start_date: string
          statement_balance: number
          status?: string
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          created_by_id?: string | null
          end_date?: string
          id?: string
          organization_id?: string
          start_date?: string
          statement_balance?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_item: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_date: string
          matched_line_id: string | null
          reconciliation_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          item_date: string
          matched_line_id?: string | null
          reconciliation_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_date?: string
          matched_line_id?: string | null
          reconciliation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_item_matched_line_id_fkey"
            columns: ["matched_line_id"]
            isOneToOne: false
            referencedRelation: "journal_line"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_item_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliation"
            referencedColumns: ["id"]
          },
        ]
      }
      workpaper_note: {
        Row: {
          company_id: string
          id: string
          notes: string
          organization_id: string
          period_end: string
          schedule_key: string
          updated_at: string
          updated_by_id: string | null
        }
        Insert: {
          company_id?: string
          id?: string
          notes?: string
          organization_id: string
          period_end: string
          schedule_key: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          notes?: string
          organization_id?: string
          period_end?: string
          schedule_key?: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workpaper_note_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_note_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_note_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      post_journal_entry: { Args: { p_entry_id: string }; Returns: string }
      reverse_journal_entry: {
        Args: {
          p_description?: string
          p_entry_id: string
          p_reversal_date: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"
      fiscal_period_status: "OPEN" | "CLOSED"
      import_batch_status: "UPLOADED" | "VALIDATED" | "IMPORTED" | "FAILED"
      import_type: "CHART_OF_ACCOUNTS" | "JOURNAL_ENTRIES"
      journal_entry_type: "STANDARD" | "OPENING" | "ADJUSTING" | "REVERSAL"
      journal_status: "DRAFT" | "POSTED" | "REVERSED"
      membership_role: "ACCOUNTANT"
      normal_balance: "DEBIT" | "CREDIT"
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
    Enums: {
      account_type: ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"],
      fiscal_period_status: ["OPEN", "CLOSED"],
      import_batch_status: ["UPLOADED", "VALIDATED", "IMPORTED", "FAILED"],
      import_type: ["CHART_OF_ACCOUNTS", "JOURNAL_ENTRIES"],
      journal_entry_type: ["STANDARD", "OPENING", "ADJUSTING", "REVERSAL"],
      journal_status: ["DRAFT", "POSTED", "REVERSED"],
      membership_role: ["ACCOUNTANT"],
      normal_balance: ["DEBIT", "CREDIT"],
    },
  },
} as const
