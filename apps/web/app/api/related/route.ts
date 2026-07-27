import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/related?itemId=<uuid>
// Espelha o padrão server-side de /api/menu: chama a RPC pública
// get_related_products (SECURITY DEFINER) e devolve o array de produtos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId')?.trim() ?? '';

    if (!UUID_RE.test(itemId)) {
      return NextResponse.json({ error: 'invalid itemId' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_related_products', { p_item_id: itemId });

    if (error) {
      console.error('Error fetching related products:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // A RPC devolve um jsonb array; normalizamos para { products: [...] }.
    return NextResponse.json({ products: data ?? [] });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
