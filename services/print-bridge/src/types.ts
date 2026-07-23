// Print-bridge types — single-tenant (sem tenant_id)

export interface PrintJob {
  id: string;
  order_id: string;
  station: 'kitchen' | 'bar' | 'cold_kitchen';
  payload: PrintPayload;
  status: 'queued' | 'printing' | 'printed' | 'failed';
  attempts: number;
  created_at: string;
  printed_at: string | null;
}

export interface PrintJobPayload {
  order_number: string;        // "ENC-0042"
  customer_name: string;
  fulfillment_type: 'pickup' | 'delivery';
  delivery_zone?: string | null;
  address?: string | null;
  scheduled_for?: string | null;  // null = ASAP
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  payment_method: 'mpesa' | 'emola' | 'credit_card' | 'cash';
  payment_status: 'paid' | 'pending';
  total_cents: number;
  notes?: string;
  created_at: string;
}

export interface TestPrintPayload {
  test: true;
  message?: string;
}

export type PrintPayload = PrintJobPayload | TestPrintPayload;

export function isTestPayload(p: PrintPayload): p is TestPrintPayload {
  return (p as TestPrintPayload).test === true;
}

export interface EventLog {
  id: number;
  order_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}
