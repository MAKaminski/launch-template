/**
 * Database types.
 *
 * This file is a hand-written placeholder that matches
 * `supabase/migrations/0001_init_<slug>.sql`. Once your Supabase project is up,
 * regenerate it from the live schema:
 *
 *     pnpm db:types
 *
 * which runs `supabase gen types typescript` against this launch's schema and
 * overwrites everything below.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type LeadRow = {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  utm: Json | null;
  posthog_distinct_id: string | null;
  ip_hash: string | null;
  created_at: string;
}

export type CustomerRow = {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  created_at: string;
}

export type OrderRow = {
  id: string;
  customer_id: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
}

export type BookingRow = {
  id: string;
  cal_booking_uid: string;
  email: string | null;
  event_type: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  created_at: string;
}

export type WebhookEventRow = {
  id: string;
  provider: string;
  external_id: string;
  payload: Json;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/**
 * The shape of this launch's schema.
 *
 * The runtime schema name is `launch_<slug>` and only known at run time, but
 * supabase-js resolves its generics from a *literal* key. So we expose the
 * shape under `public` — which is what the client's type resolution falls back
 * to — while `db: { schema: dbSchema }` points the actual queries at the real
 * schema. Structurally identical, fully type-safe, and `pnpm db:types`
 * overwrites the whole file with the generated article once you're live.
 */
export type LaunchSchema = {
  Tables: {
      leads: Table<
        LeadRow,
        Partial<Omit<LeadRow, "id" | "created_at">> & { email: string },
        Partial<LeadRow>
      >;
      customers: Table<
        CustomerRow,
        Partial<Omit<CustomerRow, "id" | "created_at">> & { email: string },
        Partial<CustomerRow>
      >;
      orders: Table<
        OrderRow,
        Partial<Omit<OrderRow, "id" | "created_at">> & {
          stripe_session_id: string;
          amount_cents: number;
          currency: string;
          status: string;
        },
        Partial<OrderRow>
      >;
      bookings: Table<
        BookingRow,
        Partial<Omit<BookingRow, "id" | "created_at">> & {
          cal_booking_uid: string;
          status: string;
        },
        Partial<BookingRow>
      >;
      webhook_events: Table<
        WebhookEventRow,
        Partial<Omit<WebhookEventRow, "id" | "created_at">> & {
          provider: string;
          external_id: string;
          payload: Json;
        },
        Partial<WebhookEventRow>
      >;
    };
    Views: Record<never, never>;
    Functions: {
      capture_lead: {
        Args: {
          p_email: string;
          p_name: string | null;
          p_source: string | null;
          p_utm: Json | null;
          p_posthog_distinct_id: string | null;
          p_ip_hash: string;
        };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
}

export interface Database {
  public: LaunchSchema;
  /** The real per-launch schema, `launch_<slug>`, resolved at run time. */
  [schema: string]: LaunchSchema;
}
