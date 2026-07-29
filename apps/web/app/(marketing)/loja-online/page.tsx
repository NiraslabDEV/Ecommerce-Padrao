import type { Metadata } from 'next';
import Image from 'next/image';
import { Icon, WhatsAppIcon, type IconName } from './icons';
import { Reveal, StickyCta, CountUp } from './ui';

/* ══════════════════════════════════════════════════════════════════════════
   ⚙️  CONFIGURAR ANTES DE PUBLICAR  (é só isto)
   ══════════════════════════════════════════════════════════════════════════ */
const CONTACT = {
  /** Número de WhatsApp em formato internacional, só dígitos. TROCAR PELO TEU. */
  whatsapp: '258840000000',
  email: 'niraslab.dev@gmail.com',
  /** Link para a loja demo (a própria instância). */
  demo: '/menu',
};

const PRICE = '5.000 MT';
const PRICE_NOTE = 'pagamento único · sem mensalidade à Niraslab';

const WA_MSG = encodeURIComponent(
  'Olá Niraslab! Vi a página da loja online e quero a minha loja por 5.000 MT. Podemos falar?',
);
const WA = `https://wa.me/${CONTACT.whatsapp}?text=${WA_MSG}`;

export const metadata: Metadata = {
  title: 'A sua loja online pronta a vender — 5.000 MT | Niraslab',
  description:
    'Loja online completa para o seu negócio em Moçambique: pagamentos M-Pesa e e-Mola (automáticos ou manuais), entregas por zona, painel de controlo, promoções, vídeo nos produtos e rastreamento de anúncios. Montamos tudo por 5.000 MT.',
  openGraph: {
    title: 'A sua loja online pronta a vender — 5.000 MT',
    description:
      'M-Pesa e e-Mola, entregas por zona, painel no telemóvel, promoções e rastreamento completo. Montado por nós, chave na mão.',
    type: 'website',
    locale: 'pt_MZ',
  },
  robots: { index: true, follow: true },
};

/* ══════════════════════════════════════════════════════════════════════════
   CONTEÚDO
   ══════════════════════════════════════════════════════════════════════════ */

const PROBLEMS = [
  {
    icon: 'message' as IconName,
    t: 'Os pedidos perdem-se nas mensagens',
    d: 'Entre DMs do Instagram, grupos e chamadas, há sempre um pedido que ficou por responder. E cada pedido perdido é dinheiro que foi para outro.',
  },
  {
    icon: 'eye' as IconName,
    t: 'Não sabe quem entrou e não comprou',
    d: 'No WhatsApp você só vê quem falou consigo. Não vê as 40 pessoas que olharam, gostaram e desistiram — nem porquê.',
  },
  {
    icon: 'card' as IconName,
    t: 'Comprovativos misturados com tudo',
    d: 'Fotos de transferência perdidas na galeria, confirmações a rolar na conversa, e no fim do dia ninguém sabe quem já pagou.',
  },
  {
    icon: 'chart' as IconName,
    t: 'Zero números para decidir',
    d: 'Qual é o produto que mais vende? A que horas se vende mais? Quanto vale um cliente? Sem loja, tudo isto é palpite.',
  },
];

const BUYER_STEPS = [
  { n: '01', t: 'Entra na sua loja', d: 'Abre o link no telemóvel. Não instala nada, não cria conta, não perde tempo.' },
  { n: '02', t: 'Vê os produtos a mexer', d: 'Fotos grandes, vídeo do produto, preços, promoções com o valor antigo riscado.' },
  { n: '03', t: 'Põe no carrinho', d: 'Escolhe tamanho, extras e quantidade. O total atualiza-se à frente dele.' },
  { n: '04', t: 'Levantamento ou entrega', d: 'Escolhe levantar na loja ou receber em casa — cada zona com a sua taxa, automática.' },
  { n: '05', t: 'Paga por M-Pesa ou e-Mola', d: 'Paga na hora pelo telemóvel, ou transfere e envia o comprovativo. Você decide o modo.' },
  { n: '06', t: 'Acompanha o pedido', d: 'Recebido → Em preparo → Pronto → Entregue. Ele vê tudo e deixa de lhe ligar a perguntar.' },
];

type Feature = { t: string; d: string };
type Group = { icon: IconName; kicker: string; title: string; features: Feature[]; wide?: boolean };

const GROUPS: Group[] = [
  {
    icon: 'card',
    kicker: 'Dinheiro',
    title: 'Pagamentos M-Pesa e e-Mola — automáticos ou manuais',
    wide: true,
    features: [
      {
        t: 'Modo automático (recomendado)',
        d: 'O cliente paga por M-Pesa, e-Mola ou cartão dentro da própria loja. O pedido confirma-se sozinho, sem você tocar em nada — funciona às 3 da manhã.',
      },
      {
        t: 'Modo manual (sem gateway)',
        d: 'A loja mostra o seu número M-Pesa/e-Mola, o cliente transfere e envia o comprovativo. Você vê a foto no painel e aprova ou nega com um clique.',
      },
      {
        t: 'Dinheiro na entrega',
        d: 'Também suportado. O pedido entra na mesma fila e conta na caixa do dia.',
      },
      {
        t: 'Pagamento à prova de falhas',
        d: 'Três verificações independentes confirmam cada pagamento. Se a rede falhar no meio, o sistema reconcilia sozinho — nenhum cliente fica preso em "a processar".',
      },
      {
        t: 'Impossível pagar a menos',
        d: 'Todos os preços e taxas são recalculados no servidor. Mesmo que alguém tente mexer no telemóvel dele, o valor cobrado é o seu.',
      },
      {
        t: 'O dinheiro é seu, direto',
        d: 'Cai na sua conta M-Pesa/e-Mola. Não passa por nós em momento nenhum.',
      },
    ],
  },
  {
    icon: 'bag',
    kicker: 'Catálogo',
    title: 'Você mesmo troca os produtos, quando quiser',
    features: [
      { t: 'Adicionar, editar e apagar produtos', d: 'Nome, descrição, foto, preço. Do telemóvel, em segundos, sem nos pedir nada.' },
      { t: 'Vídeo no produto', d: 'Um vídeo curto a mostrar a peça a mexer. Vende muito mais do que foto parada.' },
      { t: 'Segunda foto com troca automática', d: 'Sem vídeo? A loja alterna entre duas fotos, ou faz zoom lento. O catálogo nunca parece morto.' },
      { t: 'Tamanhos e extras', d: 'P/M/G com preços diferentes, adicionais e sugestões de venda cruzada.' },
      { t: 'Arrastar para reordenar', d: 'Põe o que quer vender primeiro no topo, arrastando com o dedo.' },
      { t: 'Ligar e desligar num toque', d: 'Acabou o stock? Desliga. Voltou? Liga. Sem apagar nada.' },
      { t: 'Controlo de stock', d: 'Define a quantidade e o sistema desconta a cada venda. Chega a zero, sai da loja sozinho.' },
      { t: 'Importar e exportar em Excel', d: 'Carrega 200 produtos de uma vez a partir de um ficheiro. Exporta a lista completa quando quiser.' },
      { t: 'Produtos relacionados', d: '"Quem levou isto também levou…" — configurado por si, para aumentar o valor do carrinho.' },
    ],
  },
  {
    icon: 'percent',
    kicker: 'Preços',
    title: 'Promoções a sério, sem estragar a sua tabela de preços',
    features: [
      { t: 'De 1.200 MT por 890 MT', d: 'O preço antigo aparece riscado com o selo de desconto. É o que faz o cliente decidir na hora.' },
      { t: 'Campanhas por loja, categoria ou produto', d: '20% em toda a loja, ou só nos perfumes, ou só naquele artigo parado.' },
      { t: 'Desconto em % ou em meticais', d: 'Como preferir: 15% ou menos 300 MT.' },
      { t: 'Campanha com hora marcada', d: 'Começa sexta às 18h e acaba domingo à meia-noite — sozinha, mesmo que você esteja a dormir.' },
      { t: 'Desligou, voltou tudo ao normal', d: 'A promoção é uma regra, não uma alteração de preços. Nenhum preço original se perde.' },
      { t: 'Cupões e códigos', d: 'Códigos de desconto validados no servidor — ninguém inventa um cupom e passa.' },
    ],
  },
  {
    icon: 'truck',
    kicker: 'Entregas',
    title: 'Entrega por zona, levantamento e agendamento',
    features: [
      { t: 'Zonas com taxa própria', d: 'Baixa 150 MT, Costa do Sol 250 MT, Matola 350 MT. O cliente escolhe e o sistema soma.' },
      { t: 'Levantamento na loja', d: 'Mostra a morada e abre o mapa. Taxa zero.' },
      { t: 'Agendamento por horas', d: '"Quero às 18h30." O cliente escolhe o horário e você prepara na hora certa.' },
      { t: 'Horário de funcionamento', d: 'A loja abre e fecha sozinha. Fora de horas não entram pedidos que você não consegue fazer.' },
      { t: 'Lista de espera', d: 'Com a loja fechada, quem chega deixa o contacto. Você abre com clientes já à espera.' },
      { t: 'Morada obrigatória na entrega', d: 'Nunca mais um pedido sem saber para onde vai.' },
    ],
  },
  {
    icon: 'grid',
    kicker: 'Painel',
    title: 'O painel de controlo — no seu telemóvel',
    wide: true,
    features: [
      { t: 'Pedidos ao vivo', d: 'Cada pedido cai no painel com nome, contacto, itens, morada e horário. Em lista ou em calendário.' },
      { t: 'Aprovar ou negar em 1 clique', d: 'Vê o comprovativo em grande, confirma, e o cliente recebe o email na hora.' },
      { t: 'Estados do pedido', d: 'Em preparo → Pronto → Entregue. O cliente vê a mesma coisa no telemóvel dele.' },
      { t: 'Fecho de caixa', d: 'No fim do dia: total faturado, esperado vs contado, diferença, notas. Sai em PDF e por email.' },
      { t: 'Análise do negócio', d: 'Faturação por dia/semana/mês, ticket médio, produtos mais vendidos, horas de pico, entrega vs levantamento.' },
      { t: 'Os seus melhores clientes', d: 'Quem compra mais, quanto gastou, quantas vezes voltou.' },
      { t: 'Avaliações', d: 'O cliente avalia depois de receber. Você lê tudo num sítio só.' },
      { t: 'Emails automáticos', d: 'Você recebe "novo pedido". O cliente recebe "pagamento confirmado" ou "não confirmado". Sem escrever nada.' },
    ],
  },
  {
    icon: 'target',
    kicker: 'Marketing',
    title: 'Tudo rastreado — sabe exatamente de onde vem cada venda',
    wide: true,
    features: [
      {
        t: 'Cookies e funil completo',
        d: 'Quantos entraram → quantos viram um produto → quantos puseram no carrinho → quantos compraram. Vê onde as pessoas desistem e corrige.',
      },
      {
        t: 'Facebook, Instagram e Google prontos',
        d: 'Meta Pixel, Google Analytics, Google Ads e Tag Manager já ligados. Cola os seus códigos no painel e está feito — sem programador.',
      },
      {
        t: 'A venda chega mesmo com bloqueador',
        d: 'O sistema envia a compra ao Facebook e ao Google também pelo servidor. iPhone e bloqueadores de anúncios deixam de lhe roubar resultados.',
      },
      {
        t: 'Sabe se a venda veio do Instagram ou do Google',
        d: 'Cada visita fica marcada com a origem. No fim do mês vê qual é o anúncio que dá lucro e qual é o que só gasta.',
      },
      {
        t: 'Consentimento de cookies em português',
        d: 'Banner legal. Nada de rastreio carrega antes do cliente aceitar.',
      },
      {
        t: 'Os seus próprios dados',
        d: 'Além do Facebook e do Google, os eventos ficam guardados na sua base de dados. Se um dia mudar de plataforma, o histórico é seu.',
      },
    ],
  },
  {
    icon: 'gift',
    kicker: 'Crescimento',
    title: 'Os seus clientes a trazerem clientes',
    features: [
      { t: 'Indique e Ganhe', d: 'Cada cliente tem um código para partilhar. O amigo usa e ganha desconto ou um brinde.' },
      { t: 'À prova de esperto', d: 'Ninguém usa o próprio código, ninguém usa duas vezes. Validado no servidor, não no telemóvel.' },
      { t: 'Meta de brinde', d: '"Faltam 400 MT para o seu presente." A barra enche e o carrinho cresce sozinho.' },
      { t: 'Cliente reconhecido', d: 'Entra com o número de telefone, sem password. Vê favoritos, histórico e repete o pedido num toque.' },
      { t: 'Pedir de novo', d: 'O cliente habitual recompra em 10 segundos. É assim que se cria hábito.' },
    ],
  },
  {
    icon: 'sparkles',
    kicker: 'Imagem',
    title: 'A loja com a cara da sua marca',
    features: [
      { t: 'As suas cores e o seu logótipo', d: 'Não é um template genérico com o nome trocado. A loja fica sua.' },
      { t: 'Formatos de página', d: 'Escolhe entre layouts diferentes de página inicial — com hero grande ou com faixa de mini-banners.' },
      { t: 'Banners que você troca', d: 'Sobe as imagens da campanha do mês a partir do painel.' },
      { t: 'Feita para telemóvel', d: 'Desenhada primeiro para o telemóvel, porque é daí que vêm 9 em cada 10 dos seus clientes.' },
      { t: 'Rápida com internet fraca', d: 'Pensada para a realidade da rede em Moçambique, não para escritório com fibra.' },
      { t: 'Bonita quando partilhada', d: 'Ao colar o link no WhatsApp ou no Facebook, aparece com imagem e título — não um link seco.' },
    ],
  },
  {
    icon: 'shield',
    kicker: 'Segurança',
    title: 'Construída como deve ser',
    features: [
      { t: 'Site seguro (https)', d: 'Cadeado no browser, obrigatório para aceitar pagamentos e para o Google não penalizar.' },
      { t: 'Comprovativos privados', d: 'As fotos de transferência ficam num cofre fechado. Só você vê, e por links temporários.' },
      { t: 'Base de dados blindada', d: 'Segurança ao nível de cada linha: o público nunca lê diretamente a sua base de dados.' },
      { t: 'Domínio próprio', d: 'aloja-da-sua-marca.co.mz ou .com — a sua morada na internet, não uma sub-página de outro.' },
      { t: 'Páginas legais incluídas', d: 'Privacidade, termos, trocas e devoluções — já escritas.' },
      { t: 'Encontrada no Google', d: 'Estrutura preparada para indexação, com mapa do site.' },
    ],
  },
  {
    icon: 'printer',
    kicker: 'Opcional',
    title: 'Impressora térmica 24/7',
    features: [
      { t: 'O pedido sai impresso sozinho', d: 'Assim que o pagamento é confirmado, o talão sai no balcão ou na cozinha.' },
      { t: 'Com tudo o que interessa', d: 'Número do pedido, nome do cliente em destaque, itens, zona, morada e horário.' },
      { t: 'A impressora nunca é o problema', d: 'Se ela falhar ou ficar sem papel, o pedido continua no painel. Nada se perde.' },
    ],
  },
];

const PROCESS = [
  {
    n: '1',
    t: 'Conversamos 30 minutos',
    d: 'No WhatsApp ou pessoalmente. Percebemos o que vende, como entrega, quais são as suas zonas e como quer receber o dinheiro. Sem compromisso.',
    tag: 'Grátis',
  },
  {
    n: '2',
    t: 'Confirma e paga os 5.000 MT',
    d: 'Pagamento único de implementação, por M-Pesa ou e-Mola. A partir daqui o trabalho é nosso.',
    tag: 'Pagamento único',
  },
  {
    n: '3',
    t: 'Você envia o material',
    d: 'Logótipo, fotos dos produtos, lista com preços e as zonas de entrega. Se não tiver a lista organizada, nós montamo-la consigo.',
    tag: 'A sua parte',
  },
  {
    n: '4',
    t: 'Montamos tudo',
    d: 'Loja com as suas cores, catálogo carregado, zonas e taxas, pagamentos ligados e testados, emails, domínio, páginas legais e rastreamento.',
    tag: '48 a 72 horas',
  },
  {
    n: '5',
    t: 'Entregamos e ensinamos',
    d: 'Sessão de 45 minutos a mostrar o painel: adicionar produto, criar promoção, aprovar pagamento, fechar a caixa. Fica a saber mexer.',
    tag: 'Formação incluída',
  },
  {
    n: '6',
    t: 'Acompanhamos o arranque',
    d: 'Suporte nos primeiros dias para o que aparecer. Depois disso, a loja é sua e você mexe em tudo sem depender de nós.',
    tag: 'Suporte de arranque',
  },
];

const INCLUDED = [
  'Loja online completa com o seu domínio',
  'Design com as suas cores, logótipo e fotos',
  'Catálogo carregado por nós (produtos, preços, categorias)',
  'M-Pesa e e-Mola configurados — automático ou manual',
  'Zonas de entrega com as suas taxas',
  'Painel de controlo com acesso pelo telemóvel',
  'Caixa, análise de vendas e avaliações',
  'Sistema de promoções e cupões',
  'Rastreamento Facebook + Google + cookies próprios',
  'Emails automáticos para si e para o cliente',
  'Páginas legais (privacidade, termos, devoluções)',
  'Formação de 45 minutos + suporte de arranque',
];

const NOT_INCLUDED = [
  {
    t: 'Domínio próprio',
    d: 'Pago uma vez por ano diretamente ao registador (.com ou .co.mz). Tratamos do registo por si; o custo é dele, não nosso.',
  },
  {
    t: 'Comissão do gateway',
    d: 'Só se escolher pagamento automático. É a percentagem que a operadora cobra por transação — cobrada por eles, não por nós.',
  },
  {
    t: 'Impressora térmica',
    d: 'Equipamento opcional. Só faz sentido para quem tem cozinha ou balcão com movimento.',
  },
  {
    t: 'Produção de fotos e vídeos',
    d: 'Se não tiver material, fazemos orçamento à parte. Com fotos suas, está incluído.',
  },
];

const FAQ = [
  {
    q: 'Preciso perceber de computadores?',
    a: 'Não. Se sabe usar o WhatsApp e o Instagram, sabe usar o painel. Tudo funciona no telemóvel, em português, e ensinamos numa sessão de 45 minutos. Adicionar um produto leva menos tempo do que publicar um story.',
  },
  {
    q: 'Os 5.000 MT são mesmo pagamento único?',
    a: 'Sim — é o valor da implementação completa. Não cobramos mensalidade pelo sistema. Os únicos custos que continuam são de terceiros: o domínio (uma vez por ano) e a comissão da operadora se optar pelo pagamento automático. Está tudo listado acima, sem letras pequenas.',
  },
  {
    q: 'O dinheiro das vendas passa por vocês?',
    a: 'Nunca. O pagamento vai direto para a sua conta M-Pesa ou e-Mola. Nós montamos a ligação e entregamos as chaves; não tocamos no seu dinheiro nem temos acesso a ele.',
  },
  {
    q: 'Posso mudar preços e produtos sozinho?',
    a: 'Sim, e é esse o objetivo. Preços, fotos, vídeos, descrições, promoções, zonas de entrega, horários — tudo se muda no painel, sem nos pagar nem esperar por nós. Se preferir carregar tudo de uma vez, importa um ficheiro de Excel.',
  },
  {
    q: 'Quanto tempo demora?',
    a: '48 a 72 horas depois de recebermos o seu material (logótipo, fotos e lista de preços). O que costuma atrasar não somos nós — é o material do cliente. Quanto mais depressa enviar, mais depressa vende.',
  },
  {
    q: 'Já vendo bem no Instagram. Porquê uma loja?',
    a: 'A loja não substitui o Instagram, alimenta-o. Continua a publicar, mas em vez de responder a 30 DMs iguais, manda o link. O cliente escolhe, paga e você recebe o pedido organizado — e ainda fica a saber quantas pessoas entraram e não compraram, coisa que o Instagram não lhe diz.',
  },
  {
    q: 'E se eu tiver muitos produtos?',
    a: 'Sem problema. Importamos a lista completa a partir de um ficheiro de Excel, com categorias e preços. Já não é trabalho manual.',
  },
  {
    q: 'Funciona com internet fraca?',
    a: 'Foi feita a pensar nisso. O site é leve e as confirmações de pagamento têm três verificações independentes — se a rede cair a meio, o sistema resolve sozinho quando voltar.',
  },
  {
    q: 'A loja é minha ou vossa?',
    a: 'É sua. O domínio fica em seu nome, os dados dos seus clientes são seus, o catálogo é seu. Não a prendemos a nós.',
  },
  {
    q: 'E se eu quiser algo que não está aqui?',
    a: 'Fale connosco. A base já traz tudo o que está nesta página; funcionalidades feitas de propósito para o seu negócio são orçamentadas à parte, com preço fechado antes de começarmos.',
  },
];

const GUARANTEES = [
  'M-Pesa e e-Mola',
  'Pagamento único de 5.000 MT',
  'Pronta em 48–72h',
  'Você mesmo gere tudo',
  'Sem mensalidade à Niraslab',
  'Formação incluída',
  'Domínio em seu nome',
  'Feita em Moçambique',
];

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTES DE PÁGINA
   ══════════════════════════════════════════════════════════════════════════ */

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
      style={{
        borderColor: 'rgba(2,132,199,.22)',
        color: 'var(--lp-blue-deep)',
        background: 'rgba(2,132,199,.07)',
      }}
    >
      {children}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-balance text-[clamp(2rem,5.2vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.032em]"
      style={{ color: 'var(--lp-ink)' }}
    >
      {children}
    </h2>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-2xl text-[17px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
      {children}
    </p>
  );
}

function CtaPrimary({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <a
      href={WA}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl px-7 py-4 text-[15px] font-bold text-white transition-all duration-200 hover:brightness-[1.12] focus-visible:outline-2 focus-visible:outline-offset-4 ${className}`}
      style={{ background: 'var(--lp-grad)', boxShadow: 'var(--lp-sh-cta)' }}
    >
      <WhatsAppIcon className="h-[18px] w-[18px]" />
      {children}
      <Icon name="arrow" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
    </a>
  );
}

function CtaGhost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border bg-white px-7 py-4 text-[15px] font-semibold transition-all duration-200 hover:border-[rgba(2,132,199,.42)]"
      style={{ borderColor: 'var(--lp-line-2)', color: 'var(--lp-ink)', boxShadow: 'var(--lp-sh-1)' }}
    >
      {children}
    </a>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PÁGINA
   ══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <main
      className="lp relative overflow-x-clip"
      style={{ background: 'var(--lp-bg)', color: 'var(--lp-ink)', fontFamily: 'var(--font-body)' }}
    >
      {/* ─── Navbar ───────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{ borderColor: 'var(--lp-line)', background: 'rgba(255,255,255,.80)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', boxShadow: 'var(--lp-sh-cta)' }}
            >
              <Icon name="zap" className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="text-lg font-extrabold tracking-[-0.02em]" style={{ color: 'var(--lp-ink)' }}>
              Niraslab
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={CONTACT.demo}
              className="hidden cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-colors duration-200 hover:border-[rgba(2,132,199,.42)] sm:inline-block"
              style={{ borderColor: 'var(--lp-line-2)', color: 'var(--lp-ink)' }}
            >
              Ver loja demo
            </a>
            <a
              href={WA}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:brightness-[1.12]"
              style={{ background: 'var(--lp-grad)', boxShadow: 'var(--lp-sh-cta)' }}
            >
              <WhatsAppIcon className="h-4 w-4" />
              Quero a minha loja
            </a>
          </div>
        </div>
      </header>

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="lp-aurora relative isolate overflow-hidden px-5 pb-20 pt-14 md:pb-28 md:pt-20">
        <div className="lp-grid absolute inset-0 -z-10" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <Reveal>
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-xs font-bold"
                style={{ borderColor: 'rgba(2,132,199,.22)', color: 'var(--lp-blue-deep)' }}
              >
                <span className="lp-pulse h-1.5 w-1.5 rounded-full" style={{ background: 'var(--lp-blue)' }} />
                Para negócios em Moçambique
              </div>

              <h1
                className="text-balance text-[clamp(2.6rem,7.4vw,5.2rem)] font-extrabold leading-[1.02] tracking-[-0.04em]"
                style={{ color: 'var(--lp-ink)' }}
              >
                A sua loja online
                <br />
                <span className="lp-shine">pronta a vender</span>
              </h1>

              <p className="mt-7 max-w-xl text-[18px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                Site próprio com o seu nome. Pagamentos{' '}
                <strong className="font-bold" style={{ color: 'var(--lp-ink)' }}>
                  M-Pesa
                </strong>{' '}
                e{' '}
                <strong className="font-bold" style={{ color: 'var(--lp-ink)' }}>
                  e-Mola
                </strong>
                , entregas por zona, promoções, vídeo nos produtos e um painel que você controla do telemóvel.
                <br />
                <span className="font-semibold" style={{ color: 'var(--lp-ink)' }}>
                  Montamos tudo por si. Uma vez.
                </span>
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div
                className="mt-8 inline-flex flex-wrap items-end gap-x-4 gap-y-1 rounded-2xl border bg-white px-5 py-4"
                style={{ borderColor: 'rgba(2,132,199,.24)', boxShadow: 'var(--lp-sh-2)' }}
              >
                <span
                  className="text-[clamp(2.4rem,6.4vw,3.2rem)] font-extrabold leading-none tracking-[-0.035em]"
                  style={{ color: 'var(--lp-blue-deep)' }}
                >
                  {PRICE}
                </span>
                <span className="pb-1 text-sm" style={{ color: 'var(--lp-mute)' }}>
                  {PRICE_NOTE}
                </span>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <CtaPrimary>Quero a minha loja</CtaPrimary>
                <CtaGhost href="#tudo-incluido">Ver tudo o que faz</CtaGhost>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: 'var(--lp-mute)' }}>
                <span style={{ color: 'var(--lp-blue)' }}>
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />
                </span>
                Conversa inicial sem compromisso · Pronta em 48–72 horas
              </p>
            </Reveal>
          </div>

          {/* Mockup do telemóvel */}
          <Reveal delay={260} className="justify-self-center">
            <div className="relative">
              <div
                className="absolute -inset-12 -z-10 rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle,rgba(14,165,233,.34),transparent 66%)' }}
              />
              <div
                className="relative w-[268px] rounded-[2.6rem] border p-2.5 sm:w-[300px]"
                style={{
                  borderColor: 'rgba(7,42,63,.14)',
                  background: 'linear-gradient(160deg,#f4fafe,#dfeef8)',
                  boxShadow: '0 30px 70px -30px rgba(3,105,161,.55), 0 2px 8px rgba(7,42,63,.06)',
                }}
              >
                <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2rem]" style={{ background: '#0d0d0d' }}>
                  <Image
                    src="/assets/thebox/hero.png"
                    alt="Exemplo de loja online criada pela Niraslab, vista no telemóvel"
                    fill
                    sizes="300px"
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
                  <div className="absolute inset-x-4 bottom-4 space-y-2.5">
                    <div
                      className="rounded-2xl border p-3.5 backdrop-blur-md"
                      style={{ borderColor: 'rgba(255,255,255,.18)', background: 'rgba(255,255,255,.12)' }}
                    >
                      <p className="text-[10px] uppercase tracking-widest text-white/70">Novo pedido</p>
                      <p className="mt-0.5 text-sm font-bold text-white">ENC-0042 · 1.450 MT</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: '#7dd3fc' }}>
                        M-Pesa confirmado · Entrega Costa do Sol
                      </p>
                    </div>
                    <div
                      className="rounded-2xl py-3 text-center text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)' }}
                    >
                      Finalizar pedido
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Faixa de garantias (marquee) ─────────────────────────────── */}
      <div className="border-y py-4" style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-bg-2)' }}>
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="lp-marquee flex shrink-0 items-center gap-8 pr-8">
            {[...GUARANTEES, ...GUARANTEES].map((g, i) => (
              <span
                key={i}
                className="flex shrink-0 items-center gap-2.5 text-sm font-semibold"
                style={{ color: 'var(--lp-dim)' }}
              >
                <span style={{ color: 'var(--lp-blue)' }}>
                  <Icon name="check" className="h-4 w-4 shrink-0" strokeWidth={2.6} />
                </span>
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── PROBLEMA ─────────────────────────────────────────────────── */}
      <section className="px-5 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Kicker>O problema</Kicker>
            <H2>
              Vender pelo WhatsApp
              <br />
              tem um teto.
            </H2>
            <Lead>
              Não é falta de clientes — é falta de estrutura. Enquanto o pedido depender de alguém estar a olhar para o
              telemóvel, o seu negócio cresce até onde as suas mãos chegam. Não mais.
            </Lead>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.t} delay={i * 90}>
                <div className="lp-card h-full rounded-2xl p-6">
                  <span
                    className="mb-4 grid h-11 w-11 place-items-center rounded-xl"
                    style={{ background: 'var(--lp-coral-soft)', color: 'var(--lp-coral)' }}
                  >
                    <Icon name={p.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="text-[17px] font-bold tracking-[-0.01em]">{p.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                    {p.d}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMO O CLIENTE COMPRA ────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-y px-5 py-24 md:py-32"
        style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-bg-2)' }}
      >
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Kicker>A experiência do seu cliente</Kicker>
            <H2>Da primeira vista ao pedido pago em 6 passos.</H2>
            <Lead>
              Sem instalar aplicações, sem criar contas, sem esperar resposta. É esta fricção a menos que transforma
              quem só estava a espreitar em quem compra.
            </Lead>
          </Reveal>

          <div
            className="mt-14 grid gap-px overflow-hidden rounded-3xl border sm:grid-cols-2 lg:grid-cols-3"
            style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-line)', boxShadow: 'var(--lp-sh-1)' }}
          >
            {BUYER_STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 70}>
                <div className="h-full bg-white p-7">
                  <span
                    className="text-2xl font-extrabold tracking-[-0.03em]"
                    style={{ color: 'rgba(2,132,199,.55)' }}
                  >
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-[17px] font-bold tracking-[-0.01em]">{s.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                    {s.d}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <CtaGhost href={CONTACT.demo}>
                <Icon name="phone" className="h-4 w-4" />
                Experimentar a loja demo
              </CtaGhost>
              <p className="text-sm" style={{ color: 'var(--lp-mute)' }}>
                Abra no telemóvel e faça um pedido de teste — é exatamente assim que a sua vai funcionar.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── TUDO INCLUÍDO ────────────────────────────────────────────── */}
      <section id="tudo-incluido" className="scroll-mt-20 px-5 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Kicker>Tudo o que vem dentro</Kicker>
            <H2>
              Não é um site bonito.
              <br />É uma máquina de vender.
            </H2>
            <Lead>
              Tudo o que está aqui em baixo vem ligado no primeiro dia. Sem módulos extra, sem versão limitada, sem
              &ldquo;isso é no plano de cima&rdquo;.
            </Lead>
          </Reveal>

          <div className="mt-16 space-y-5">
            {GROUPS.map((g, gi) => (
              <Reveal key={g.title} delay={gi < 3 ? gi * 80 : 0}>
                <div className="lp-card rounded-3xl p-6 md:p-9">
                  <div className="flex items-start gap-4 border-b pb-6" style={{ borderColor: 'var(--lp-line)' }}>
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
                      style={{
                        background: 'linear-gradient(135deg,#0ea5e9,#0369a1)',
                        boxShadow: '0 8px 20px -10px rgba(2,132,199,.75)',
                      }}
                    >
                      <Icon name={g.icon} className="h-[22px] w-[22px]" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--lp-blue-deep)' }}>
                        {g.kicker}
                      </p>
                      <h3 className="mt-1 text-balance text-[21px] font-extrabold leading-tight tracking-[-0.025em] md:text-[26px]">
                        {g.title}
                      </h3>
                    </div>
                  </div>

                  <ul className={`mt-6 grid gap-x-8 gap-y-5 ${g.wide ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'}`}>
                    {g.features.map((f) => (
                      <li key={f.t} className="flex gap-3">
                        <span className="mt-0.5 shrink-0" style={{ color: 'var(--lp-blue)' }}>
                          <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        </span>
                        <div>
                          <p className="text-[15px] font-bold leading-snug tracking-[-0.01em]">{f.t}</p>
                          <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                            {f.d}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NÚMEROS ──────────────────────────────────────────────────── */}
      <section className="border-y px-5 py-20" style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-bg-2)' }}>
        <div className="mx-auto grid max-w-6xl gap-10 text-center sm:grid-cols-3">
          {[
            { v: 72, s: 'h', l: 'para a loja estar no ar', sub: 'depois de recebermos o material' },
            { v: 100, s: '%', l: 'do controlo é seu', sub: 'produtos, preços e promoções sem depender de nós' },
            { v: 0, s: ' MT', l: 'de mensalidade à Niraslab', sub: 'paga a implementação uma vez' },
          ].map((n, i) => (
            <Reveal key={n.l} delay={i * 100}>
              <p
                className="text-[clamp(2.8rem,8vw,4.4rem)] font-extrabold leading-none tracking-[-0.04em]"
                style={{ color: 'var(--lp-blue-deep)' }}
              >
                <CountUp to={n.v} suffix={n.s} />
              </p>
              <p className="mt-3 text-[17px] font-bold tracking-[-0.01em]">{n.l}</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--lp-mute)' }}>
                {n.sub}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── COMO TRABALHAMOS ─────────────────────────────────────────── */}
      <section className="px-5 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Kicker>Como nós trabalhamos</Kicker>
            <H2>Você trata do negócio. Nós tratamos do resto.</H2>
            <Lead>
              Sem reuniões infinitas nem orçamentos que mudam a meio. Seis passos, prazo fechado e preço fechado.
            </Lead>
          </Reveal>

          <ol className="relative mt-14 space-y-4">
            {PROCESS.map((p, i) => (
              <Reveal key={p.n} delay={i * 70}>
                <li className="lp-card grid gap-5 rounded-2xl p-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8 md:p-7">
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white"
                    style={{
                      background: 'linear-gradient(135deg,#0ea5e9,#0369a1)',
                      boxShadow: '0 8px 20px -10px rgba(2,132,199,.75)',
                    }}
                  >
                    {p.n}
                  </span>
                  <div>
                    <h3 className="text-[19px] font-extrabold tracking-[-0.02em]">{p.t}</h3>
                    <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                      {p.d}
                    </p>
                  </div>
                  <span
                    className="justify-self-start rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider md:justify-self-end"
                    style={{
                      borderColor: 'rgba(2,132,199,.22)',
                      color: 'var(--lp-blue-deep)',
                      background: 'rgba(2,132,199,.07)',
                    }}
                  >
                    {p.tag}
                  </span>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── PREÇO ────────────────────────────────────────────────────── */}
      <section
        id="preco"
        className="lp-aurora relative scroll-mt-20 overflow-hidden border-y px-5 py-24 md:py-32"
        style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-bg-2)' }}
      >
        <div className="relative mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center">
              <Kicker>Investimento</Kicker>
              <H2>Uma vez. E a loja é sua.</H2>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <Reveal>
              <div
                className="relative h-full overflow-hidden rounded-3xl border bg-white p-7 md:p-10"
                style={{ borderColor: 'rgba(2,132,199,.30)', boxShadow: 'var(--lp-sh-2)' }}
              >
                <div
                  className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full"
                  style={{ background: 'radial-gradient(circle,rgba(6,182,212,.20),transparent 70%)' }}
                  aria-hidden="true"
                />
                <p className="relative text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--lp-blue-deep)' }}>
                  Implementação completa
                </p>
                <div className="relative mt-3 flex flex-wrap items-end gap-3">
                  <span
                    className="text-[clamp(3rem,11vw,5.2rem)] font-extrabold leading-none tracking-[-0.045em]"
                    style={{ color: 'var(--lp-ink)' }}
                  >
                    {PRICE}
                  </span>
                  <span className="pb-2 text-[15px]" style={{ color: 'var(--lp-dim)' }}>
                    pagamento único
                  </span>
                </div>
                <p className="relative mt-3 text-[15px]" style={{ color: 'var(--lp-dim)' }}>
                  Paga por M-Pesa ou e-Mola. Sem mensalidade nossa, sem comissão sobre as suas vendas.
                </p>

                <ul className="relative mt-8 grid gap-3 sm:grid-cols-2">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[15px]">
                      <span className="mt-0.5 shrink-0" style={{ color: 'var(--lp-blue)' }}>
                        <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={2.6} />
                      </span>
                      <span className="font-medium" style={{ color: 'var(--lp-ink)' }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="relative mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <CtaPrimary className="w-full sm:w-auto">Reservar a minha loja</CtaPrimary>
                  <p className="text-sm" style={{ color: 'var(--lp-mute)' }}>
                    Resposta no mesmo dia útil.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="lp-card h-full rounded-3xl p-7 md:p-8">
                <h3 className="text-[19px] font-extrabold tracking-[-0.02em]">O que não está incluído</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--lp-mute)' }}>
                  Preferimos dizer isto à frente do que na fatura.
                </p>
                <ul className="mt-7 space-y-6">
                  {NOT_INCLUDED.map((n) => (
                    <li key={n.t}>
                      <p className="text-[15px] font-bold tracking-[-0.01em]">{n.t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
                        {n.d}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────── */}
      <section className="px-5 py-24 md:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <Kicker>Perguntas frequentes</Kicker>
            <H2>As dúvidas de sempre.</H2>
          </Reveal>

          <div className="mt-12 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i < 5 ? i * 60 : 0}>
                <details className="lp-faq lp-card group rounded-2xl">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 text-[16px] font-bold tracking-[-0.01em] md:p-6">
                    {f.q}
                    <span
                      className="lp-chev grid h-7 w-7 shrink-0 place-items-center rounded-full border text-lg leading-none transition-transform duration-200"
                      style={{
                        borderColor: 'rgba(2,132,199,.28)',
                        color: 'var(--lp-blue-deep)',
                        background: 'rgba(2,132,199,.07)',
                      }}
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-relaxed md:px-6 md:pb-6" style={{ color: 'var(--lp-dim)' }}>
                    {f.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ────────────────────────────────────────────────── */}
      <section
        className="lp-aurora relative overflow-hidden border-t px-5 py-24 md:py-32"
        style={{ borderColor: 'var(--lp-line)', background: 'var(--lp-bg-2)' }}
      >
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <H2>
              Amanhã pode estar
              <br />
              <span className="lp-shine">a receber pedidos.</span>
            </H2>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed" style={{ color: 'var(--lp-dim)' }}>
              Mande uma mensagem. Fazemos as perguntas certas, dizemos o que precisamos de si e, em 48 a 72 horas, a sua
              loja está no ar com o seu nome.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaPrimary>Falar agora no WhatsApp</CtaPrimary>
              <CtaGhost href={`mailto:${CONTACT.email}?subject=Quero%20a%20minha%20loja%20online`}>
                <Icon name="mail" className="h-4 w-4" />
                {CONTACT.email}
              </CtaGhost>
            </div>

            <p className="mt-8 text-sm" style={{ color: 'var(--lp-mute)' }}>
              Feito em Maputo · Suporte em português · O dinheiro cai direto na sua conta
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t bg-white px-5 py-10" style={{ borderColor: 'var(--lp-line)' }}>
        <div
          className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-sm sm:flex-row"
          style={{ color: 'var(--lp-mute)' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-7 w-7 place-items-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)' }}
            >
              <Icon name="zap" className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            <span className="text-base font-extrabold tracking-[-0.02em]" style={{ color: 'var(--lp-ink)' }}>
              Niraslab
            </span>
          </div>
          <p>Lojas online para negócios moçambicanos.</p>
          <div className="flex items-center gap-5">
            <a href={CONTACT.demo} className="cursor-pointer font-medium transition-colors duration-200 hover:text-[var(--lp-blue-deep)]">
              Loja demo
            </a>
            <a href="#preco" className="cursor-pointer font-medium transition-colors duration-200 hover:text-[var(--lp-blue-deep)]">
              Preço
            </a>
            <a
              href={WA}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-medium transition-colors duration-200 hover:text-[var(--lp-blue-deep)]"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </footer>

      <div className="h-20 md:hidden" />
      <StickyCta href={WA} price={PRICE} />
    </main>
  );
}
