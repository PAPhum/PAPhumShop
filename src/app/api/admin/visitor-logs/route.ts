import { NextRequest } from 'next/server';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';
import { dbErrorResponse, serverErrorResponse } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = 25;
    const query = (searchParams.get('q') ?? '').trim();

    // คำนวณเวลาเริ่มวันของไทย (UTC+7)
    const now = new Date();
    const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const startOfTodayBangkok = new Date(
      Date.UTC(
        bangkokNow.getUTCFullYear(),
        bangkokNow.getUTCMonth(),
        bangkokNow.getUTCDate(),
        0,
        0,
        0
      ) -
        7 * 60 * 60 * 1000
    ).toISOString();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let listQuery = supabase
      .from('visitor_logs')
      .select('*', { count: 'exact' })
      .order('visited_at', { ascending: false });

    if (query) {
      const safe = query.replace(/[\\%_,()]/g, '');
      if (safe) {
        listQuery = listQuery.or(
          `ip_address.ilike.%${safe}%,device_model.ilike.%${safe}%,browser_name.ilike.%${safe}%,path.ilike.%${safe}%,location.ilike.%${safe}%`
        );
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const [todayRes, weekRes, totalRes, listRes] = await Promise.all([
      supabase
        .from('visitor_logs')
        .select('id', { count: 'exact', head: true })
        .gte('visited_at', startOfTodayBangkok),
      supabase
        .from('visitor_logs')
        .select('id', { count: 'exact', head: true })
        .gte('visited_at', sevenDaysAgo),
      supabase
        .from('visitor_logs')
        .select('id', { count: 'exact', head: true }),
      listQuery.range(from, to),
    ]);

    if (listRes.error) {
      return dbErrorResponse('visitor_logs.list', listRes.error, 500);
    }

    return jsonNoStore({
      stats: {
        today: todayRes.count ?? 0,
        last7Days: weekRes.count ?? 0,
        total30Days: totalRes.count ?? 0,
      },
      logs: listRes.data ?? [],
      totalFiltered: listRes.count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    return serverErrorResponse('visitor_logs.get', err);
  }
}

export async function DELETE() {
  try {
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;
    const { error } = await supabase
      .from('visitor_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      return dbErrorResponse('visitor_logs.clear', error, 400);
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    return serverErrorResponse('visitor_logs.delete', err);
  }
}