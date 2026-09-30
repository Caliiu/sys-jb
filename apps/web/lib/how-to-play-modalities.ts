/** Uma modalidade na tela "Como jogar": como se joga e quando ganha (texto enviado pela operação). */
export interface ModalityRule {
  name: string;
  /** Como se joga ("Joga-se com…"). */
  plays: string;
  /** Quando ganha. */
  wins: string;
  /** Observação extra (ex.: Sorte Extra). */
  extra?: string;
}

const PROPORTIONAL = 'O prêmio é pago proporcionalmente ao número de combinações e posições selecionadas.';

/** Modalidades, na ordem do texto "Como jogar" da operação. Para mudar o texto, edite só este arquivo. */
export const MODALITY_RULES: readonly ModalityRule[] = [
  {
    name: 'Centena',
    plays: 'Joga-se com 01 centena.',
    wins: 'Acertando a centena do milhar, que representa os 03 últimos dígitos da direita do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Centena Invertida',
    plays: 'Joga-se uma centena com 3 a 8 dígitos (combinada).',
    wins: 'Acertando a centena invertida conforme a posição selecionada, pagando proporcional à quantidade de combinações.',
  },
  {
    name: 'Centena 3X',
    plays: 'Joga-se com 01 centena.',
    wins: 'Acertando a centena no 1º prêmio, ou no 1º prêmio invertido, ou no 1/5 normal.',
  },
  {
    name: 'Centena Esquerda',
    plays: 'Joga-se com 01 centena.',
    wins: 'Acertando a centena que representa os 03 primeiros dígitos da ESQUERDA do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Centena Invertida Esquerda',
    plays: 'Joga-se uma centena com 3 dígitos ou até 8 dígitos (combinada).',
    wins: 'Acertando a centena invertida que representa os 03 primeiros dígitos da ESQUERDA do milhar, conforme a posição selecionada, pagando proporcional à quantidade de combinações.',
  },
  {
    name: 'Milhar',
    plays: 'Joga-se com um milhar.',
    wins: 'Acertando 01 milhar conforme a posição selecionada.',
  },
  {
    name: 'Milhar Invertida',
    plays: 'Joga-se um milhar com 4 dígitos ou até 10 dígitos (combinada).',
    wins: 'Acertando o milhar invertido conforme a posição selecionada, pagando proporcional à quantidade de combinações.',
  },
  {
    name: 'Milhar e Centena',
    plays: 'Joga-se o milhar e o aplicativo insere a centena automaticamente, com a metade do valor apostado.',
    wins: 'Acertando 01 milhar ou 01 centena do milhar conforme a posição selecionada.',
  },
  {
    name: 'Unidade',
    plays: 'Joga-se com uma unidade.',
    wins: 'Acertando a unidade que representa o 1º dígito da direita do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Dezena',
    plays: 'Joga-se com uma dezena.',
    wins: 'Acertando a dezena que representa os 02 dígitos da direita do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Dezena Esquerda',
    plays: 'Joga-se com uma dezena.',
    wins: 'Acertando a dezena que representa os 02 primeiros dígitos da ESQUERDA do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Dezena Meio',
    plays: 'Joga-se com uma dezena.',
    wins: 'Acertando a dezena que representa os 02 dígitos do MEIO do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Duque de Dezena',
    plays: 'Joga-se com 02 dezenas ou até 10 dezenas (combinado).',
    wins: `Acertando as duas dezenas dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Duque de Dezena Esquerda',
    plays: 'Joga-se com 02 dezenas ou até 10 dezenas (combinado).',
    wins: `Acertando duas dezenas da ESQUERDA do milhar, dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Duque de Dezena Meio',
    plays: 'Joga-se com 02 dezenas ou até 10 dezenas (combinado).',
    wins: `Acertando duas dezenas do MEIO do milhar, dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Terno de Dezena Seco',
    plays: 'Joga-se com 03 dezenas.',
    wins: 'Acertando 03 dezenas do 1/3 prêmio, em qualquer ordem.',
  },
  {
    name: 'Terno de Dezena Seco Esquerda',
    plays: 'Joga-se com 03 dezenas.',
    wins: 'Acertando 03 dezenas da ESQUERDA do milhar do 1/3 prêmio, em qualquer ordem.',
  },
  {
    name: 'Terno de Dezena',
    plays: 'Joga-se com 03 dezenas ou até 10 dezenas (combinado).',
    wins: 'Acertando três dezenas do 1/5 prêmio. O prêmio é pago proporcionalmente ao número de combinações selecionadas.',
  },
  {
    name: 'Grupo',
    plays: 'Joga-se com 01 grupo, do 01 ao 25.',
    wins: 'Acertando o grupo representado pela dezena dos 02 dígitos da direita do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Grupo Esquerda',
    plays: 'Joga-se com 01 grupo, do 01 ao 25.',
    wins: 'Acertando o grupo representado pela dezena dos 02 primeiros dígitos da ESQUERDA do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Grupo Meio',
    plays: 'Joga-se com 01 grupo, do 01 ao 25.',
    wins: 'Acertando o grupo representado pela dezena dos 02 dígitos do MEIO do milhar, conforme a posição selecionada.',
  },
  {
    name: 'Duque de Grupo',
    plays: 'Joga-se com 02 grupos ou até 10 grupos (combinado).',
    wins: `Acertando 02 grupos dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Duque de Grupo Esquerda',
    plays: 'Joga-se com 02 grupos ou até 10 grupos (combinado).',
    wins: `Acertando 02 grupos da ESQUERDA dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Duque de Grupo Meio',
    plays: 'Joga-se com 02 grupos ou até 10 grupos (combinado).',
    wins: `Acertando 02 grupos do MEIO dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Terno de Grupo',
    plays: 'Joga-se com 03 grupos ou até 06 grupos (combinado).',
    wins: `Acertando 03 grupos dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Terno de Grupo Esquerda',
    plays: 'Joga-se com 03 grupos ou até 06 grupos (combinado).',
    wins: `Acertando 03 grupos da ESQUERDA dentro das posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Terno de Grupo Meio',
    plays: 'Joga-se com 03 grupos ou até 06 grupos (combinado).',
    wins: `Acertando 03 grupos do MEIO, baseado nas posições selecionadas. ${PROPORTIONAL}`,
  },
  {
    name: 'Quadra de Grupo',
    plays: 'Joga-se com 04 grupos.',
    wins: 'Acertando os 04 grupos do 1/5 prêmio.',
  },
  {
    name: 'Quadra de Grupo Esquerda',
    plays: 'Joga-se com 04 grupos.',
    wins: 'Acertando os 04 grupos da ESQUERDA do 1/5 prêmio.',
  },
  {
    name: 'Quadra de Grupo Meio',
    plays: 'Joga-se com 04 grupos.',
    wins: 'Acertando os 04 grupos do MEIO do 1/5 prêmio.',
  },
  {
    name: 'Quina de Grupo',
    plays: 'Joga-se com 08 grupos.',
    wins: 'Acertando 05 grupos do 1/5 prêmio.',
  },
  {
    name: 'Quina de Grupo Esquerda',
    plays: 'Joga-se com 08 grupos.',
    wins: 'Acertando 05 grupos da ESQUERDA do 1/5 prêmio.',
  },
  {
    name: 'Quina de Grupo Meio',
    plays: 'Joga-se com 08 grupos.',
    wins: 'Acertando 05 grupos do MEIO do 1/5 prêmio.',
  },
  {
    name: 'Sena de Grupo',
    plays: 'Joga-se com 10 grupos.',
    wins: 'Acertando 06 grupos do 1/6 prêmio.',
  },
  {
    name: 'Sena de Grupo Esquerda',
    plays: 'Joga-se com 10 grupos.',
    wins: 'Acertando 06 grupos da ESQUERDA do 1/6 prêmio.',
  },
  {
    name: 'Sena de Grupo Meio',
    plays: 'Joga-se com 10 grupos.',
    wins: 'Acertando 06 grupos do MEIO do 1/6 prêmio.',
  },
  {
    name: 'Palpitão',
    plays: 'Joga-se com 20 dezenas, de 00 a 99.',
    wins: 'Acertando Terno (03 dezenas), Quadra (04 dezenas) ou Quina (05 dezenas) do 1/5 prêmio. O prêmio é pago na proporção de 1%, 10% e 100%, respectivamente. Números repetidos contam apenas uma vez, pois não é possível jogar mais de uma vez o mesmo número.',
  },
  {
    name: 'Seninha',
    plays: 'Joga-se a partir de 14 dezenas.',
    wins: 'Acertando 06 dezenas.',
    extra: 'Sorte Extra: ganhe com 4, 5 e 6 acertos.',
  },
  {
    name: 'Quininha',
    plays: 'Joga-se a partir de 13 dezenas.',
    wins: 'Acertando 05 dezenas.',
    extra: 'Sorte Extra: ganhe com 3, 4 e 5 acertos.',
  },
  {
    name: 'Lotinha',
    plays: 'Joga-se a partir de 16 dezenas.',
    wins: 'Acertando 15 dezenas.',
  },
  {
    name: 'Passe Vai',
    plays: 'Joga-se com 02 grupos.',
    wins: 'Acertando os grupos na ordem apostada, sendo o primeiro grupo obrigatoriamente no 1º prêmio e o outro em qualquer dos outros prêmios.',
  },
  {
    name: 'Passe Vai e Vem',
    plays: 'Joga-se com 02 grupos.',
    wins: 'Acertando, em qualquer ordem, ambos os grupos, sendo um no 1º prêmio e o outro em qualquer das demais posições.',
  },
];
