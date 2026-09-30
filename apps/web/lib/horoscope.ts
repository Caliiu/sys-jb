/**
 * Horóscopo do dia (Loterias > Horóscopo): signos, o signo de uma data de nascimento e a leitura do dia. A previsão vem
 * da API do provedor (cache diário da nossa API); sem ela (dia ainda não publicado, integração desligada), a leitura é
 * gerada aqui, determinística pela data (Brasília) e pelo signo. Entretenimento: não altera cotação nem chance de prêmio.
 */
import { HOROSCOPE_SIGNS, type HoroscopeSign, type PublicHoroscopeReading, isHoroscopeSign } from '@sysjb/contracts';

export const ZODIAC_SIGNS = HOROSCOPE_SIGNS;
export type ZodiacSign = HoroscopeSign;

type Element = 'fogo' | 'terra' | 'ar' | 'agua';

interface SignInfo {
  name: string;
  /** Quem é do signo ("ariano"). */
  demonym: string;
  /** Planeta regente. */
  ruler: string;
  element: Element;
  /** Primeiro dia do signo (MM-DD). */
  starts: string;
}

export const SIGN_INFO: Record<ZodiacSign, SignInfo> = {
  aries: { name: 'Áries', demonym: 'ariano', ruler: 'Marte', element: 'fogo', starts: '03-21' },
  touro: { name: 'Touro', demonym: 'taurino', ruler: 'Vênus', element: 'terra', starts: '04-20' },
  gemeos: { name: 'Gêmeos', demonym: 'geminiano', ruler: 'Mercúrio', element: 'ar', starts: '05-21' },
  cancer: { name: 'Câncer', demonym: 'canceriano', ruler: 'a Lua', element: 'agua', starts: '06-21' },
  leao: { name: 'Leão', demonym: 'leonino', ruler: 'o Sol', element: 'fogo', starts: '07-23' },
  virgem: { name: 'Virgem', demonym: 'virginiano', ruler: 'Mercúrio', element: 'terra', starts: '08-23' },
  libra: { name: 'Libra', demonym: 'libriano', ruler: 'Vênus', element: 'ar', starts: '09-23' },
  escorpiao: { name: 'Escorpião', demonym: 'escorpiano', ruler: 'Plutão', element: 'agua', starts: '10-23' },
  sagitario: { name: 'Sagitário', demonym: 'sagitariano', ruler: 'Júpiter', element: 'fogo', starts: '11-22' },
  capricornio: { name: 'Capricórnio', demonym: 'capricorniano', ruler: 'Saturno', element: 'terra', starts: '12-22' },
  aquario: { name: 'Aquário', demonym: 'aquariano', ruler: 'Urano', element: 'ar', starts: '01-20' },
  peixes: { name: 'Peixes', demonym: 'pisciano', ruler: 'Netuno', element: 'agua', starts: '02-19' },
};

export const isZodiacSign = isHoroscopeSign;

/** Signo de uma data (YYYY-MM-DD); null se não for uma data válida. */
export function signOf(date: string): ZodiacSign | null {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const monthDay = `${match[1]}-${match[2]}`;
  // O signo é o último cujo início já passou no ano; antes de 20/01, ainda é Capricórnio (começou em dezembro).
  let found: ZodiacSign = 'capricornio';
  let latest = '';
  for (const sign of ZODIAC_SIGNS) {
    const starts = SIGN_INFO[sign].starts;
    if (starts <= monthDay && starts > latest) {
      latest = starts;
      found = sign;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Sorteio determinístico
// ---------------------------------------------------------------------------

/** Semente de 32 bits a partir de um texto (FNV-1a). */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Gerador pseudoaleatório (mulberry32): mesma semente, mesma sequência, em qualquer ambiente. */
function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Dia como advérbio: "nesta quarta-feira", "neste sábado". */
const DAY_PHRASES = [
  'neste domingo',
  'nesta segunda-feira',
  'nesta terça-feira',
  'nesta quarta-feira',
  'nesta quinta-feira',
  'nesta sexta-feira',
  'neste sábado',
] as const;

/** Dia como sujeito ou objeto da frase: "esta quarta-feira favorece…", "…marca este sábado". */
const DAY_SUBJECTS = [
  'este domingo',
  'esta segunda-feira',
  'esta terça-feira',
  'esta quarta-feira',
  'esta quinta-feira',
  'esta sexta-feira',
  'este sábado',
] as const;

/**
 * Abertura por signo: {dia} = "nesta quarta-feira" ({dia_maiusculo} no início da frase); {o_dia} = "esta quarta-feira"
 * (o dia como sujeito ou objeto); {gent} = "ariano"; {regente} =
 * "Marte" / "a Lua"; {de_regente} = "de Marte" / "da Lua" (contração).
 */
const OPENINGS: Record<ZodiacSign, readonly string[]> = {
  aries: [
    'A energia {de_regente} impulsiona você a tomar iniciativas ousadas {dia}, {gent}: no trabalho, sua natureza pioneira abre portas para liderar um projeto ou apresentar ideias que serão bem recebidas.',
    '{dia_maiusculo}, {regente} acende sua coragem, {gent}, e você sente vontade de sair na frente: é um bom momento para encarar aquela tarefa que vinha adiando.',
    'Com {regente} em evidência, {o_dia} pede ação, {gent}: sua determinação chama atenção e pode render um reconhecimento que você espera há tempos.',
  ],
  touro: [
    '{regente} favorece a estabilidade {dia}, {gent}: no trabalho, sua persistência mostra resultado, e um esforço feito com calma começa a dar frutos.',
    '{dia_maiusculo}, a influência {de_regente} deixa você mais atento ao que traz segurança, {gent}, e decisões práticas saem melhores do que as feitas no impulso.',
    'Com {regente} a seu favor, {o_dia} valoriza sua paciência, {gent}: quem trabalha ao seu lado percebe sua firmeza e confia no que você entrega.',
  ],
  gemeos: [
    '{regente} deixa sua mente ágil {dia}, {gent}: conversas e trocas de ideias abrem caminhos no trabalho, e uma boa notícia pode chegar por mensagem.',
    '{dia_maiusculo}, com {regente} em destaque, sua curiosidade encontra respostas, {gent}: aprender algo novo hoje pode ser útil mais cedo do que você imagina.',
    'A comunicação é seu ponto forte {dia}, {gent}: {regente} ajuda você a convencer, negociar e resolver pendências com leveza.',
  ],
  cancer: [
    'Sob a influência {de_regente}, {o_dia} desperta sua sensibilidade, {gent}: no trabalho, sua intuição mostra o melhor caminho antes dos outros perceberem.',
    '{dia_maiusculo}, {regente} fortalece seus laços, {gent}: um gesto de cuidado com um colega pode transformar o clima do ambiente.',
    'Com {regente} guiando suas emoções, {o_dia} é bom para confiar no que você sente, {gent}: sua percepção ajuda a evitar um problema.',
  ],
  leao: [
    'Com {regente} brilhando para você {dia}, {gent}, seu carisma fica em evidência: no trabalho, é hora de mostrar talento e assumir o protagonismo.',
    '{dia_maiusculo}, a energia {de_regente} aumenta sua autoconfiança, {gent}, e as pessoas tendem a seguir suas ideias com entusiasmo.',
    '{regente} favorece sua criatividade {dia}, {gent}: um projeto ganha vida quando você coloca nele seu jeito generoso e marcante.',
  ],
  virgem: [
    '{regente} aguça sua atenção aos detalhes {dia}, {gent}: no trabalho, organizar tarefas e revisar o que ficou pendente traz um resultado acima do esperado.',
    '{dia_maiusculo}, com {regente} em destaque, seu senso prático resolve o que parecia complicado, {gent}, e você ganha a confiança de quem depende de você.',
    'Com {regente} a seu favor, {o_dia} é ideal para planejar, {gent}: um cronograma bem feito hoje poupa esforço nos próximos dias.',
  ],
  libra: [
    '{regente} traz harmonia {dia}, {gent}: no trabalho, sua habilidade de mediar conversas ajuda a resolver um impasse e aproxima as pessoas.',
    '{dia_maiusculo}, com {regente} em evidência, seu bom gosto e equilíbrio fazem diferença, {gent}, e uma parceria pode render bons frutos.',
    'Com {regente} guiando seus passos, {o_dia} favorece acordos, {gent}: pese os dois lados com calma antes de tomar uma decisão importante.',
  ],
  escorpiao: [
    '{regente} intensifica sua determinação {dia}, {gent}: no trabalho, seu foco profundo revela uma oportunidade que outros deixaram passar.',
    '{dia_maiusculo}, a influência {de_regente} fortalece sua intuição, {gent}, e você enxerga com clareza o que está por trás das aparências.',
    'Com {regente} em destaque, {o_dia} é bom para transformar algo que não funciona mais, {gent}: uma mudança bem pensada abre espaço para o novo.',
  ],
  sagitario: [
    '{regente} amplia seus horizontes {dia}, {gent}: no trabalho, seu otimismo contagia a equipe e uma ideia ousada ganha apoio.',
    '{dia_maiusculo}, com {regente} a seu favor, a sorte acompanha quem arrisca com consciência, {gent}, e um plano antigo pode sair do papel.',
    'A energia expansiva {de_regente} marca {o_dia}, {gent}: novos contatos e aprendizados trazem oportunidades inesperadas.',
  ],
  capricornio: [
    '{regente} recompensa sua disciplina {dia}, {gent}: no trabalho, o esforço constante começa a aparecer, e alguém importante nota sua responsabilidade.',
    '{dia_maiusculo}, com {regente} em evidência, você constrói com segurança, {gent}: metas de longo prazo avançam um passo firme.',
    'Com {regente} guiando seus planos, {o_dia} favorece a organização, {gent}: sua seriedade abre portas para uma conquista merecida.',
  ],
  aquario: [
    '{regente} estimula sua originalidade {dia}, {gent}: no trabalho, uma solução diferente do comum pode resolver um problema antigo.',
    '{dia_maiusculo}, com {regente} em destaque, suas ideias inovadoras encontram quem as apoie, {gent}, e a colaboração rende mais do que o esforço solitário.',
    'Com {regente} a seu favor, {o_dia} pede liberdade para criar, {gent}: confie no seu jeito único de enxergar as coisas.',
  ],
  peixes: [
    '{regente} desperta sua imaginação {dia}, {gent}: no trabalho, sua criatividade e empatia ajudam a encontrar saídas que ninguém tinha visto.',
    '{dia_maiusculo}, com {regente} em evidência, sua intuição está afiada, {gent}: preste atenção aos sinais e aos pressentimentos.',
    'Com {regente} guiando seus sonhos, {o_dia} favorece projetos criativos, {gent}: uma inspiração pode virar um plano concreto.',
  ],
};

/** Amor, dinheiro e bem-estar, pelo elemento do signo (combinados, dão variedade dia a dia). */
const AREAS: Record<Element, { love: readonly string[]; money: readonly string[]; health: readonly string[] }> = {
  fogo: {
    love: [
      'No amor, sua intensidade aquece os relacionamentos, mas cuidado para não confundir paixão com impaciência: reserve um momento para ouvir antes de agir.',
      'No amor, uma atitude espontânea pode surpreender quem você gosta; para quem está só, um encontro animado promete boas conversas.',
      'Nos relacionamentos, sua franqueza é bem-vinda, desde que venha com carinho: palavras gentis evitam discussões desnecessárias.',
    ],
    money: [
      'As finanças pedem atenção aos impulsos de compra: canalize essa energia para planejar objetivos futuros.',
      'No dinheiro, evite decisões apressadas; um bom negócio continua bom amanhã, depois de pensar com calma.',
      'Nas finanças, sua iniciativa pode abrir uma nova fonte de renda, desde que você mantenha os gastos sob controle.',
    ],
    health: [
      'Para o bem-estar, pratique atividades físicas que desafiem seu corpo: liberar essa força trará equilíbrio e disposição.',
      'Para a saúde, alterne momentos de ação com pausas: descansar também faz parte de ir mais longe.',
      'No bem-estar, uma caminhada ao ar livre ajuda a clarear as ideias e renovar a energia para o resto da semana.',
    ],
  },
  terra: {
    love: [
      'No amor, pequenos gestos de cuidado dizem mais do que grandes declarações; a rotina a dois fica mais leve com atenção aos detalhes.',
      'Nos relacionamentos, sua lealdade é valorizada; para quem está só, uma amizade pode se transformar em algo especial.',
      'No amor, um programa simples e acolhedor fortalece a união e traz a tranquilidade que você procura.',
    ],
    money: [
      'Nas finanças, sua prudência é aliada: revisar gastos e poupar um pouco hoje traz segurança para os próximos meses.',
      'No dinheiro, um investimento pensado com calma tende a render bem; fuja de promessas de ganho fácil.',
      'As finanças favorecem a organização: colocar as contas em dia libera a cabeça para novos planos.',
    ],
    health: [
      'Para o bem-estar, cuide da alimentação e do sono: o corpo responde bem a uma rotina equilibrada.',
      'Na saúde, um momento de contato com a natureza renova as energias e acalma a mente.',
      'Para o bem-estar, alongamentos e uma pausa no meio do dia evitam o cansaço acumulado.',
    ],
  },
  ar: {
    love: [
      'No amor, uma boa conversa aproxima e esclarece dúvidas; diga o que sente com leveza e bom humor.',
      'Nos relacionamentos, a troca de ideias fortalece a parceria; para quem está só, um papo interessante pode virar encontro.',
      'No amor, dar espaço e ter confiança deixam a relação mais leve e divertida.',
    ],
    money: [
      'Nas finanças, uma troca de informações pode indicar uma boa oportunidade; confira os detalhes antes de fechar negócio.',
      'No dinheiro, evite gastar por impulso em novidades; priorize o que realmente faz diferença no seu dia a dia.',
      'As finanças pedem planejamento: anotar entradas e saídas ajuda a enxergar onde é possível economizar.',
    ],
    health: [
      'Para o bem-estar, desacelere a mente: uma leitura leve ou uma música tranquila ajudam a descansar.',
      'Na saúde, respire fundo e faça pausas entre as tarefas; o equilíbrio vem de dosar os estímulos.',
      'Para o bem-estar, encontros com amigos recarregam suas energias e melhoram o humor.',
    ],
  },
  agua: {
    love: [
      'No amor, sua sensibilidade cria momentos de conexão profunda; mostre seus sentimentos sem medo.',
      'Nos relacionamentos, acolher e ser acolhido é o que importa hoje; para quem está só, uma afinidade inesperada pode surgir.',
      'No amor, confie na sua intuição para entender o que o outro não diz com palavras.',
    ],
    money: [
      'Nas finanças, siga seu instinto, mas confira os números: a combinação dos dois evita surpresas.',
      'No dinheiro, evite emprestar ou gastar por emoção; proteger suas reservas agora traz tranquilidade depois.',
      'As finanças favorecem quem planeja com calma: um objetivo claro ajuda a guardar dinheiro com mais facilidade.',
    ],
    health: [
      'Para o bem-estar, cuide das emoções: um tempo só para você ajuda a recarregar as energias.',
      'Na saúde, beber bastante água e dormir bem fazem toda a diferença na sua disposição.',
      'Para o bem-estar, atividades relaxantes como meditação ou um banho demorado trazem equilíbrio.',
    ],
  },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "de Marte", "da Lua", "do Sol": a preposição contrai com o artigo do regente. */
const ofRuler = (ruler: string) =>
  ruler.startsWith('a ') ? `da ${ruler.slice(2)}` : ruler.startsWith('o ') ? `do ${ruler.slice(2)}` : `de ${ruler}`;

// ---------------------------------------------------------------------------
// Leitura do dia
// ---------------------------------------------------------------------------

export interface HoroscopeTips {
  /** Grupo do bicho (1–25): na leitura do provedor, o da 1ª dezena. */
  group: number;
  /** Dezenas: as do provedor; na leitura local, as 4 do grupo ("57"…"60"; o grupo 25 termina em "00"). */
  tens: string[];
  /** Uma centena para cada dezena. */
  hundreds: string[];
  /** Uma milhar para cada centena. */
  thousands: string[];
}

export interface HoroscopeReading {
  sign: ZodiacSign;
  /** YYYY-MM-DD. */
  date: string;
  text: string;
  tips: HoroscopeTips;
  /** Cores do dia (só na previsão do provedor). */
  colors: string[];
  /** provider = API do provedor; local = gerada aqui. */
  source: 'provider' | 'local';
}

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD. */
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Leitura do signo na data (YYYY-MM-DD, Brasília): mesma entrada, mesma leitura. */
export function dailyReading(sign: ZodiacSign, date: string): HoroscopeReading {
  const info = SIGN_INFO[sign];
  const random = randomFrom(seedOf(`horoscopo|${date}|${sign}`));
  const weekday = weekdayOf(date);
  const day = DAY_PHRASES[weekday]!;
  const areas = AREAS[info.element];

  const opening = pick(random, OPENINGS[sign])
    .replaceAll('{dia_maiusculo}', capitalize(day))
    .replaceAll('{dia}', day)
    .replaceAll('{o_dia}', DAY_SUBJECTS[weekday]!)
    .replaceAll('{gent}', info.demonym);
  const text = [
    capitalize(opening.replaceAll('{de_regente}', ofRuler(info.ruler)).replaceAll('{regente}', info.ruler)),
    pick(random, areas.love),
    pick(random, areas.money),
    pick(random, areas.health),
  ].join(' ');

  const group = 1 + Math.floor(random() * 25);
  const tens = [1, 2, 3, 4].map((i) => String(((group - 1) * 4 + i) % 100).padStart(2, '0'));
  const hundreds = tens.map((ten) => `${Math.floor(random() * 10)}${ten}`);
  const thousands = hundreds.map((hundred) => `${Math.floor(random() * 10)}${hundred}`);

  return { sign, date, text, tips: { group, tens, hundreds, thousands }, colors: [], source: 'local' };
}

/** Grupo (1–25) de uma dezena: 01–04 = 1 … 97–00 = 25. */
const groupOfTen = (ten: string) => Math.ceil((Number(ten) || 100) / 4);

/**
 * Leitura do signo na data: a do provedor, quando existe, com os palpites a partir das dezenas dele (grupo da 1ª dezena;
 * centena e milhar de cada dezena, com os algarismos da frente sorteados pela data e pelo signo, como na leitura local);
 * senão, a leitura local.
 */
export function readingFor(sign: ZodiacSign, date: string, official?: PublicHoroscopeReading): HoroscopeReading {
  if (!official || official.tens.length === 0) return dailyReading(sign, date);
  const random = randomFrom(seedOf(`horoscopo-palpites|${date}|${sign}`));
  const tens = official.tens;
  const hundreds = tens.map((ten) => `${Math.floor(random() * 10)}${ten}`);
  const thousands = hundreds.map((hundred) => `${Math.floor(random() * 10)}${hundred}`);
  return {
    sign,
    date,
    text: official.text,
    tips: { group: groupOfTen(tens[0]!), tens, hundreds, thousands },
    colors: official.colors,
    source: 'provider',
  };
}
