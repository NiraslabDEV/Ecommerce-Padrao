// Vídeos de produto hardcoded (portfólio) — enquanto o Supabase do cliente não
// tem menu_items.video_url (migration pendente), ligamos direto por nome aqui.
// Assim que a coluna existir, item.video_url (vindo do get_menu()) tem prioridade
// e este mapa vira só o fallback — ver ProductMedia em menu-ui.tsx.
export const HARDCODED_PRODUCT_VIDEOS: Record<string, string> = {
  'Conjunto Linho Amarelo': '/assets/videos/vid-camisa-linho-amarela-M.mp4',
  'Camisa de Linho Verde': '/assets/videos/vid-camisa-linho-verde-H.mp4',
  'Conjunto Linho Branco': '/assets/videos/vid-linho-branco-M.mp4',
  'Camisa de Linho Branco': '/assets/videos/vid-linho-branco-H.mp4',
};
