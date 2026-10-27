import { PrismaClient, Difficulty } from "@prisma/client";

const prisma = new PrismaClient();

type SeedOption = { text: string; correct?: boolean };
type SeedQuestion = {
  statement: string;
  explanation: string;
  difficulty?: Difficulty;
  options: SeedOption[];
};

// ──────────────────────────────────────────────
// Banco de questões fictícias, organizado por matéria.
// As questões de cada matéria são fatiadas entre os concursos que a
// utilizam (ver `contestDefinitions`), então cada questão pertence a um
// único concurso.
// ──────────────────────────────────────────────

const portugues: SeedQuestion[] = [
  {
    statement: "Assinale a alternativa em que a concordância verbal está correta.",
    options: [
      { text: "Fazem dois anos que ele passou no concurso." },
      { text: "Faz dois anos que ele passou no concurso.", correct: true },
      { text: "Fazem dois anos que ele passaram no concurso." },
      { text: "Houveram dois anos de espera." },
      { text: "Deve haverem mais vagas no próximo edital." },
    ],
    explanation:
      "O verbo 'fazer' indicando tempo decorrido é impessoal e fica sempre na 3ª pessoa do singular.",
  },
  {
    statement: "Em qual alternativa o uso da crase está correto?",
    options: [
      { text: "Entreguei o documento à ela." },
      { text: "Cheguei à uma hora da tarde." },
      { text: "Refiro-me à situação apresentada no edital.", correct: true },
      { text: "Ele se dirigiu à mim com respeito." },
      { text: "Isso é contrário à regras básicas." },
    ],
    explanation:
      "Há crase diante de palavra feminina determinada ('à situação'). Antes de pronomes pessoais e palavras indeterminadas não se usa crase.",
  },
  {
    statement: "Assinale a alternativa correta quanto à regência verbal.",
    options: [
      { text: "O candidato assistiu a prova sem dificuldades." },
      { text: "O candidato assistiu à prova sem dificuldades.", correct: true },
      { text: "O candidato assistiu na prova sem dificuldades." },
      { text: "O candidato assistiu com a prova sem dificuldades." },
      { text: "O candidato assistiu sobre a prova sem dificuldades." },
    ],
    explanation:
      "'Assistir' no sentido de 'presenciar' é transitivo indireto e exige a preposição 'a'.",
  },
  {
    statement:
      "Qual das frases está de acordo com a norma-padrão quanto à colocação pronominal?",
    options: [
      { text: "Não se preocupe com o resultado.", correct: true },
      { text: "Não preocupe-se com o resultado." },
      { text: "Preocupe-se não com o resultado." },
      { text: "Se não preocupe com o resultado." },
      { text: "Não preocupe se com o resultado." },
    ],
    explanation:
      "Diante de palavra atrativa, como o advérbio de negação 'não', a próclise é obrigatória.",
  },
  {
    statement:
      "Assinale a alternativa em que todas as palavras estão acentuadas corretamente.",
    options: [
      { text: "Fácil, açúcar, útil", correct: true },
      { text: "Facíl, assucar, util" },
      { text: "Fácil, açucar, útil" },
      { text: "Facil, açúcar, util" },
      { text: "Fácil, açúcar, utíl" },
    ],
    explanation:
      "As paroxítonas terminadas em 'l' e 'r' recebem acento: fácil, açúcar, útil.",
  },
  {
    statement: "A palavra 'diligente' é sinônimo de:",
    options: [
      { text: "preguiçoso" },
      { text: "esforçado, aplicado", correct: true },
      { text: "desonesto" },
      { text: "apressado" },
      { text: "desatento" },
    ],
    explanation: "'Diligente' descreve quem age com cuidado e empenho, ou seja, esforçado.",
  },
  {
    statement: "O antônimo de 'obsoleto' é:",
    options: [
      { text: "moderno, atual", correct: true },
      { text: "antigo" },
      { text: "ultrapassado" },
      { text: "velho" },
      { text: "arcaico" },
    ],
    explanation: "'Obsoleto' significa ultrapassado; seu antônimo é 'moderno' ou 'atual'.",
  },
  {
    statement:
      "\"O concurso público é uma das formas mais democráticas de acesso a um cargo público, pois avalia os candidatos por critérios objetivos e impessoais.\" Segundo o texto, o concurso público é considerado democrático porque:",
    options: [
      { text: "garante estabilidade financeira aos candidatos" },
      { text: "avalia os candidatos por critérios objetivos e impessoais", correct: true },
      { text: "reduz o número de candidatos inscritos" },
      { text: "exige experiência prévia no setor público" },
      { text: "prioriza candidatos com maior escolaridade" },
    ],
    explanation: "O motivo é dado explicitamente no próprio trecho.",
  },
  {
    statement:
      "Na frase 'Ele estudou bastante para a prova', a palavra 'bastante' classifica-se como:",
    options: [
      { text: "substantivo" },
      { text: "adjetivo" },
      { text: "advérbio", correct: true },
      { text: "pronome" },
      { text: "conjunção" },
    ],
    explanation: "'Bastante' modifica o verbo 'estudou', indicando intensidade: é advérbio.",
  },
  {
    statement: "Assinale a alternativa que contém erro de grafia.",
    options: [
      { text: "Excesso" },
      { text: "Privilégio" },
      { text: "Exceção" },
      { text: "Previlégio", correct: true },
      { text: "Ascensão" },
    ],
    explanation: "A forma correta é 'privilégio', e não 'previlégio'.",
  },
];

const raciocinioLogico: SeedQuestion[] = [
  {
    statement: "Se todo policial é concursado, e João é policial, então:",
    options: [
      { text: "João não é concursado" },
      { text: "João é concursado", correct: true },
      { text: "João pode ou não ser concursado" },
      { text: "Nenhum concursado é policial" },
      { text: "João é policial, mas não concursado" },
    ],
    explanation: "Trata-se de um silogismo direto: se todo A é B e x é A, então x é B.",
  },
  {
    statement:
      "Um concurso teve 800 candidatos inscritos, dos quais 35% são mulheres. Quantos candidatos são homens?",
    options: [
      { text: "280" },
      { text: "420" },
      { text: "480" },
      { text: "520", correct: true },
      { text: "600" },
    ],
    explanation: "35% de 800 = 280 mulheres; logo, 800 - 280 = 520 homens.",
  },
  {
    statement: "A sequência 2, 6, 18, 54, ... segue qual padrão, e qual é o próximo número?",
    options: [
      { text: "soma 4; próximo é 58" },
      { text: "multiplica por 2; próximo é 108" },
      { text: "multiplica por 3; próximo é 162", correct: true },
      { text: "multiplica por 4; próximo é 216" },
      { text: "soma 12; próximo é 66" },
    ],
    explanation: "É uma progressão geométrica de razão 3: 54 × 3 = 162.",
    difficulty: Difficulty.EASY,
  },
  {
    statement: "Se 'Nenhum aprovado é desonesto' é verdadeiro, é correto afirmar que:",
    options: [
      { text: "todo desonesto é aprovado" },
      { text: "nenhum desonesto é aprovado", correct: true },
      { text: "algum aprovado é desonesto" },
      { text: "todo aprovado é desonesto" },
      { text: "nada se pode concluir" },
    ],
    explanation: "Uma proposição universal negativa ('nenhum A é B') é conversível: 'nenhum B é A'.",
    difficulty: Difficulty.HARD,
  },
  {
    statement: "Em uma prova com 40 questões, um candidato acertou 3/5 do total. Quantas questões ele acertou?",
    options: [
      { text: "16" },
      { text: "20" },
      { text: "24", correct: true },
      { text: "28" },
      { text: "32" },
    ],
    explanation: "3/5 de 40 = 24 questões corretas.",
    difficulty: Difficulty.EASY,
  },
  {
    statement: "Se x + 5 = 12, então 2x é igual a:",
    options: [
      { text: "7" },
      { text: "10" },
      { text: "14", correct: true },
      { text: "17" },
      { text: "24" },
    ],
    explanation: "x = 7, logo 2x = 14.",
    difficulty: Difficulty.EASY,
  },
  {
    statement:
      "Considere: P = 'Estudo todos os dias'; Q = 'Passo no concurso'. Se 'P → Q' é verdadeira e Q é falsa, então:",
    options: [
      { text: "P é verdadeira" },
      { text: "P é falsa", correct: true },
      { text: "P pode ser verdadeira ou falsa" },
      { text: "Q é verdadeira" },
      { text: "nada se pode concluir sobre P" },
    ],
    explanation: "Por modus tollens: se P → Q é verdadeira e Q é falsa, então P é necessariamente falsa.",
    difficulty: Difficulty.HARD,
  },
];

const direitoConstitucional: SeedQuestion[] = [
  {
    statement:
      "São Poderes da União, independentes e harmônicos entre si, segundo a Constituição Federal de 1988:",
    options: [
      { text: "Executivo, Legislativo e Judiciário", correct: true },
      { text: "Executivo, Legislativo e Ministério Público" },
      { text: "Judiciário, Ministério Público e Legislativo" },
      { text: "Executivo, Judiciário e Tribunal de Contas" },
      { text: "Legislativo, Judiciário e Defensoria Pública" },
    ],
    explanation: "Art. 2º da CF/88.",
  },
  {
    statement: "São direitos sociais previstos no art. 6º da Constituição Federal, EXCETO:",
    options: [
      { text: "educação" },
      { text: "saúde" },
      { text: "propriedade privada", correct: true },
      { text: "lazer" },
      { text: "previdência social" },
    ],
    explanation: "Propriedade privada é direito individual (art. 5º), não direito social (art. 6º).",
  },
  {
    statement: "A Constituição Federal de 1988 classifica-se, quanto à estabilidade, como:",
    options: [
      { text: "flexível" },
      { text: "semirrígida" },
      { text: "rígida", correct: true },
      { text: "imutável" },
      { text: "fixa" },
    ],
    explanation: "Exige processo legislativo mais dificultoso do que o das leis ordinárias para ser alterada.",
  },
  {
    statement: "O ingresso em cargo público efetivo depende de aprovação prévia em:",
    options: [
      { text: "entrevista pessoal" },
      { text: "concurso público de provas ou de provas e títulos", correct: true },
      { text: "indicação política" },
      { text: "análise de currículo" },
      { text: "processo seletivo simplificado, sempre" },
    ],
    explanation: "Art. 37, II, da CF/88.",
  },
  {
    statement: "São cláusulas pétreas da Constituição Federal, dentre outras:",
    options: [
      { text: "a forma federativa de Estado", correct: true },
      { text: "o número de ministérios" },
      { text: "o valor do salário mínimo" },
      { text: "a estrutura dos tribunais estaduais" },
      { text: "o sistema tributário nacional" },
    ],
    explanation: "Art. 60, §4º, da CF/88.",
  },
  {
    statement:
      "O remédio constitucional destinado a proteger direito líquido e certo, não amparado por habeas corpus ou habeas data, é:",
    options: [
      { text: "ação popular" },
      { text: "mandado de segurança", correct: true },
      { text: "mandado de injunção" },
      { text: "ação civil pública" },
      { text: "recurso extraordinário" },
    ],
    explanation: "Art. 5º, LXIX, da CF/88.",
  },
];

const direitoAdministrativo: SeedQuestion[] = [
  {
    statement: "São princípios expressos da Administração Pública no art. 37 da CF/88:",
    options: [
      { text: "legalidade, impessoalidade, moralidade, publicidade e eficiência", correct: true },
      { text: "legalidade, hierarquia, subordinação, publicidade e eficiência" },
      { text: "impessoalidade, discricionariedade, moralidade, publicidade e eficácia" },
      { text: "legalidade, moralidade, publicidade, eficiência e vinculação" },
      { text: "impessoalidade, moralidade, publicidade, eficiência e presunção" },
    ],
    explanation: "São os princípios conhecidos pelo acrônimo LIMPE.",
  },
  {
    statement:
      "O atributo do ato administrativo que permite sua execução direta pela Administração, independentemente de ordem judicial, é a:",
    options: [
      { text: "presunção de legitimidade" },
      { text: "autoexecutoriedade", correct: true },
      { text: "imperatividade" },
      { text: "tipicidade" },
      { text: "discricionariedade" },
    ],
    explanation: "A autoexecutoriedade permite a execução do ato sem prévia manifestação do Judiciário.",
  },
  {
    statement:
      "O poder que permite à Administração impor obrigações aos administrados, independentemente de sua concordância, em prol do interesse público, é o poder:",
    options: [
      { text: "regulamentar" },
      { text: "hierárquico" },
      { text: "de polícia", correct: true },
      { text: "disciplinar" },
      { text: "discricionário" },
    ],
    explanation: "O poder de polícia condiciona e limita o exercício de direitos em prol do interesse público.",
  },
  {
    statement: "A inexigibilidade de licitação ocorre quando:",
    options: [
      { text: "há urgência comprovada" },
      { text: "há inviabilidade de competição", correct: true },
      { text: "o valor do contrato é baixo" },
      { text: "há guerra declarada" },
      { text: "o objeto é padronizado" },
    ],
    explanation: "A inexigibilidade decorre da impossibilidade de competição, como no caso de fornecedor exclusivo.",
  },
  {
    statement: "A investidura em cargo público efetivo, segundo a Lei 8.112/90, ocorre com:",
    options: [
      { text: "a nomeação" },
      { text: "a posse", correct: true },
      { text: "o exercício" },
      { text: "a estabilidade" },
      { text: "a aposentadoria" },
    ],
    explanation: "A investidura em cargo público ocorre com a posse (art. 7º, Lei 8.112/90).",
  },
  {
    statement: "O prazo de estágio probatório do servidor público federal é de:",
    options: [
      { text: "12 meses" },
      { text: "24 meses" },
      { text: "36 meses", correct: true },
      { text: "48 meses" },
      { text: "60 meses" },
    ],
    explanation: "3 anos, conforme art. 41 da CF/88 (redação da EC 19/98).",
  },
  {
    statement: "A responsabilidade civil do Estado por danos causados a terceiros, no Brasil, é, em regra:",
    options: [
      { text: "subjetiva, dependendo de comprovação de culpa" },
      { text: "objetiva, na modalidade risco administrativo", correct: true },
      { text: "inexistente para atos lícitos" },
      { text: "sempre solidária com o servidor" },
      { text: "limitada a atos comissivos dolosos" },
    ],
    explanation: "Art. 37, §6º, da CF/88 — responsabilidade objetiva do Estado.",
  },
];

const informatica: SeedQuestion[] = [
  {
    statement: "No Microsoft Excel, a fórmula '=SOMA(A1:A10)' tem a função de:",
    options: [
      { text: "multiplicar os valores de A1 a A10" },
      { text: "somar os valores das células de A1 até A10", correct: true },
      { text: "contar quantas células têm valores" },
      { text: "calcular a média dos valores" },
      { text: "localizar o maior valor" },
    ],
    explanation: "A função SOMA soma os valores do intervalo indicado.",
    difficulty: Difficulty.EASY,
  },
  {
    statement:
      "Um software malicioso que se disfarça de programa legítimo para permitir acesso não autorizado a um sistema é chamado de:",
    options: [
      { text: "firewall" },
      { text: "antivírus" },
      { text: "cavalo de troia (trojan)", correct: true },
      { text: "proxy" },
      { text: "backup" },
    ],
    explanation: "Trojans se disfarçam de programas legítimos para comprometer o sistema.",
  },
  {
    statement: "A extensão de arquivo '.pdf' é comumente associada a:",
    options: [
      { text: "planilhas eletrônicas" },
      { text: "apresentações de slides" },
      { text: "documentos portáteis com formatação fixa", correct: true },
      { text: "bancos de dados" },
      { text: "arquivos de imagem editável" },
    ],
    explanation: "PDF significa 'Portable Document Format'.",
    difficulty: Difficulty.EASY,
  },
  {
    statement: "Em navegadores de internet, a navegação anônima (modo privado):",
    options: [
      { text: "impede qualquer rastreamento na internet" },
      { text: "não salva histórico, cookies e dados de formulário localmente após a sessão", correct: true },
      { text: "criptografa todo o tráfego de rede" },
      { text: "bloqueia automaticamente anúncios" },
      { text: "impede o uso de senhas salvas em qualquer aba" },
    ],
    explanation: "O modo privado apenas evita a gravação local dos dados de navegação.",
  },
  {
    statement: "O protocolo utilizado para envio de e-mails é o:",
    options: [
      { text: "HTTP" },
      { text: "FTP" },
      { text: "SMTP", correct: true },
      { text: "SSH" },
      { text: "DNS" },
    ],
    explanation: "SMTP (Simple Mail Transfer Protocol) é usado para envio de e-mails.",
    difficulty: Difficulty.EASY,
  },
  {
    statement: "Um backup incremental copia:",
    options: [
      { text: "todos os arquivos do sistema, sempre" },
      {
        text: "apenas os arquivos alterados desde o último backup, seja ele completo ou incremental",
        correct: true,
      },
      { text: "apenas arquivos de sistema operacional" },
      { text: "apenas arquivos deletados" },
      { text: "nenhum arquivo, apenas metadados" },
    ],
    explanation: "O backup incremental grava somente as alterações desde o backup anterior.",
  },
];

const direitoDoTrabalho: SeedQuestion[] = [
  {
    statement:
      "A CLT prevê que a jornada normal de trabalho, salvo disposição especial, não deve exceder:",
    options: [
      { text: "6 horas diárias e 36 semanais" },
      { text: "8 horas diárias e 44 semanais", correct: true },
      { text: "10 horas diárias e 50 semanais" },
      { text: "8 horas diárias e 40 semanais" },
      { text: "12 horas diárias e 60 semanais" },
    ],
    explanation: "Art. 7º, XIII, da CF/88 c/c art. 58 da CLT.",
  },
  {
    statement: "O período de férias anuais remuneradas a que o empregado tem direito, em regra, é de:",
    options: [
      { text: "20 dias corridos" },
      { text: "30 dias corridos", correct: true },
      { text: "15 dias úteis" },
      { text: "45 dias corridos" },
      { text: "10 dias úteis" },
    ],
    explanation: "Art. 130 da CLT.",
    difficulty: Difficulty.EASY,
  },
  {
    statement: "A Justiça do Trabalho tem competência para processar e julgar ações oriundas da relação de trabalho, conforme:",
    options: [
      { text: "art. 5º da CF/88" },
      { text: "art. 7º da CF/88" },
      { text: "art. 114 da CF/88", correct: true },
      { text: "art. 37 da CF/88" },
      { text: "art. 6º da CF/88" },
    ],
    explanation: "O art. 114 da CF/88 define a competência da Justiça do Trabalho.",
  },
  {
    statement: "O aviso prévio, na rescisão do contrato de trabalho sem justa causa, tem duração mínima de:",
    options: [
      { text: "15 dias" },
      { text: "20 dias" },
      { text: "30 dias", correct: true },
      { text: "45 dias" },
      { text: "60 dias" },
    ],
    explanation: "Art. 7º, XXI, da CF/88 c/c Lei 12.506/2011 (mínimo de 30 dias, acrescido conforme tempo de serviço).",
  },
  {
    statement: "O FGTS corresponde a um depósito mensal, pelo empregador, equivalente a:",
    options: [
      { text: "5% da remuneração" },
      { text: "8% da remuneração", correct: true },
      { text: "10% da remuneração" },
      { text: "11% da remuneração" },
      { text: "13% da remuneração" },
    ],
    explanation: "Art. 15 da Lei 8.036/90.",
  },
  {
    statement: "Em caso de dispensa sem justa causa, o trabalhador tem direito à multa do FGTS equivalente a:",
    options: [
      { text: "20%" },
      { text: "40%", correct: true },
      { text: "50%" },
      { text: "10%" },
      { text: "30%" },
    ],
    explanation: "Art. 18, §1º, da Lei 8.036/90.",
  },
];

const direitoPrevidenciario: SeedQuestion[] = [
  {
    statement: "São segurados obrigatórios do Regime Geral de Previdência Social (RGPS), EXCETO:",
    options: [
      { text: "empregado" },
      { text: "contribuinte individual" },
      { text: "servidor público estatutário vinculado a regime próprio", correct: true },
      { text: "trabalhador avulso" },
      { text: "segurado especial" },
    ],
    explanation: "Servidores vinculados a Regime Próprio de Previdência Social (RPPS) não integram o RGPS.",
  },
  {
    statement: "O benefício previdenciário concedido ao segurado incapacitado temporariamente para o trabalho é:",
    options: [
      { text: "aposentadoria por invalidez" },
      { text: "auxílio por incapacidade temporária", correct: true },
      { text: "auxílio-reclusão" },
      { text: "salário-maternidade" },
      { text: "pensão por morte" },
    ],
    explanation: "A incapacidade temporária gera o auxílio por incapacidade temporária (antigo auxílio-doença).",
  },
  {
    statement:
      "Em regra, o salário-maternidade para a empregada exige carência (número mínimo de contribuições mensais) de:",
    options: [
      { text: "6 contribuições" },
      { text: "10 contribuições", correct: true },
      { text: "12 contribuições" },
      { text: "24 contribuições" },
      { text: "nenhuma carência, sempre" },
    ],
    explanation: "A regra geral do salário-maternidade exige 10 contribuições mensais, com exceções legais.",
  },
  {
    statement: "O benefício pago aos dependentes do segurado recluso de baixa renda é denominado:",
    options: [
      { text: "pensão por morte" },
      { text: "auxílio-reclusão", correct: true },
      { text: "benefício assistencial" },
      { text: "auxílio-acidente" },
      { text: "salário-família" },
    ],
    explanation: "O auxílio-reclusão é destinado aos dependentes do segurado preso.",
  },
  {
    statement: "O Benefício de Prestação Continuada (BPC/LOAS) é devido:",
    options: [
      { text: "a qualquer trabalhador desempregado" },
      {
        text: "ao idoso ou pessoa com deficiência de baixa renda, independentemente de contribuição",
        correct: true,
      },
      { text: "apenas a servidores públicos aposentados" },
      { text: "a quem contribuiu por mais de 15 anos" },
      { text: "apenas a menores de idade" },
    ],
    explanation: "O BPC é benefício assistencial, não contributivo (art. 20 da Lei 8.742/93).",
  },
  {
    statement: "São dependentes do segurado, na primeira classe, para fins previdenciários:",
    options: [
      { text: "irmãos" },
      { text: "pais" },
      { text: "cônjuge, companheiro e filhos não emancipados", correct: true },
      { text: "tios" },
      { text: "sobrinhos" },
    ],
    explanation: "Art. 16, I, da Lei 8.213/91.",
  },
  {
    statement:
      "A aposentadoria por idade, após a Reforma da Previdência (EC 103/2019), exige idade mínima para mulheres de:",
    options: [
      { text: "55 anos" },
      { text: "60 anos" },
      { text: "62 anos", correct: true },
      { text: "65 anos" },
      { text: "58 anos" },
    ],
    explanation: "Regra geral pós-reforma: 62 anos para mulheres e 65 anos para homens.",
  },
  {
    statement:
      "O tempo de contribuição do segurado é registrado, para fins de comprovação perante o INSS, principalmente por meio do:",
    options: [
      { text: "Cadastro Nacional de Informações Sociais (CNIS)", correct: true },
      { text: "Cartão de Vacinação" },
      { text: "Registro Civil" },
      { text: "Certidão de Nascimento" },
      { text: "Boletim de Ocorrência" },
    ],
    explanation: "O CNIS consolida os vínculos e contribuições do segurado.",
  },
];

const conhecimentosBancarios: SeedQuestion[] = [
  {
    statement: "O órgão responsável por autorizar o funcionamento e fiscalizar as instituições financeiras no Brasil é:",
    options: [
      { text: "a Comissão de Valores Mobiliários" },
      { text: "o Banco Central do Brasil", correct: true },
      { text: "a Receita Federal" },
      { text: "o Tesouro Nacional" },
      { text: "a Superintendência de Seguros Privados" },
    ],
    explanation: "O BACEN regula e fiscaliza o Sistema Financeiro Nacional.",
  },
  {
    statement: "A caderneta de poupança tem sua rentabilidade vinculada, atualmente, principalmente à taxa:",
    options: [
      { text: "CDI, exclusivamente" },
      { text: "Selic e TR, conforme regra vigente", correct: true },
      { text: "IPCA, exclusivamente" },
      { text: "dólar comercial" },
      { text: "IGP-M" },
    ],
    explanation: "A remuneração da poupança segue regra vinculada à Selic e à TR.",
  },
  {
    statement: "O CDB (Certificado de Depósito Bancário) é um tipo de investimento em que o investidor:",
    options: [
      { text: "compra ações de um banco" },
      { text: "empresta dinheiro ao banco em troca de remuneração", correct: true },
      { text: "adquire um imóvel financiado" },
      { text: "contrata um seguro de vida" },
      { text: "abre uma conta corrente remunerada" },
    ],
    explanation: "CDB é um título de renda fixa emitido por bancos.",
  },
  {
    statement: "O Fundo Garantidor de Créditos (FGC) tem como finalidade:",
    options: [
      { text: "financiar obras públicas" },
      {
        text: "proteger depositantes e investidores até determinado limite em caso de falência da instituição",
        correct: true,
      },
      { text: "fiscalizar operações de câmbio" },
      { text: "conceder crédito subsidiado a empresas" },
      { text: "administrar o Tesouro Direto" },
    ],
    explanation: "O FGC garante valores até o limite legal, por CPF e por instituição.",
  },
  {
    statement: "Em um financiamento pelo Sistema de Amortização Constante (SAC), as parcelas:",
    options: [
      { text: "são sempre iguais durante todo o contrato" },
      {
        text: "diminuem ao longo do tempo, pois a amortização é constante e os juros decrescem",
        correct: true,
      },
      { text: "aumentam progressivamente" },
      { text: "são pagas apenas no vencimento final" },
      { text: "não incluem juros" },
    ],
    explanation: "No SAC a amortização é fixa e os juros incidem sobre o saldo devedor, que decresce.",
  },
  {
    statement: "O Pix, sistema de pagamentos instantâneos brasileiro, é operado e regulado por:",
    options: [
      { text: "uma empresa privada de tecnologia" },
      { text: "o Banco Central do Brasil", correct: true },
      { text: "a Federação Brasileira de Bancos, sem regulação estatal" },
      { text: "o Tesouro Nacional" },
      { text: "a CVM" },
    ],
    explanation: "O Pix foi criado e é regulado pelo Banco Central do Brasil.",
  },
  {
    statement:
      "A taxa que representa o custo do dinheiro emprestado entre bancos no curto prazo, servindo de referência para diversas operações financeiras, é a taxa:",
    options: [
      { text: "TR" },
      { text: "Selic", correct: true },
      { text: "IPCA" },
      { text: "IGP-M" },
      { text: "referencial de câmbio" },
    ],
    explanation: "A Selic é a taxa básica de juros da economia brasileira.",
  },
  {
    statement:
      "O produto bancário destinado à guarda de valores e documentos em compartimento individual dentro da agência é conhecido como:",
    options: [
      { text: "conta poupança" },
      { text: "cofre de aluguel", correct: true },
      { text: "CDB" },
      { text: "consórcio" },
      { text: "previdência privada" },
    ],
    explanation: "O cofre de aluguel é um serviço bancário de guarda de bens.",
  },
];

const atualidades: SeedQuestion[] = [
  {
    statement:
      "O termo 'transformação digital', muito utilizado no setor bancário nos últimos anos, refere-se principalmente:",
    options: [
      { text: "à substituição total de agências físicas por lojas" },
      {
        text: "à incorporação de tecnologias digitais nos processos e serviços, alterando a forma de atuação das empresas",
        correct: true,
      },
      { text: "à digitalização exclusiva de documentos em PDF" },
      { text: "à criação de novas moedas físicas" },
      { text: "à eliminação do uso de internet nos bancos" },
    ],
    explanation: "É um conceito amplo sobre o uso de tecnologia para transformar processos e serviços.",
  },
  {
    statement: "As fintechs são caracterizadas por:",
    options: [
      { text: "empresas exclusivamente estatais do setor financeiro" },
      {
        text: "empresas de tecnologia que oferecem serviços financeiros de forma inovadora",
        correct: true,
      },
      { text: "sindicatos de trabalhadores bancários" },
      { text: "órgãos reguladores do mercado de capitais" },
      { text: "instituições exclusivamente de seguros" },
    ],
    explanation: "Fintechs unem tecnologia ('tech') e finanças ('finance') para inovar serviços financeiros.",
  },
];

// ──────────────────────────────────────────────
// Matérias (slug + nome)
// ──────────────────────────────────────────────

const subjectDefinitions = [
  { slug: "portugues", name: "Língua Portuguesa" },
  { slug: "raciocinio-logico-matematico", name: "Raciocínio Lógico-Matemático" },
  { slug: "direito-constitucional", name: "Direito Constitucional" },
  { slug: "direito-administrativo", name: "Direito Administrativo" },
  { slug: "informatica", name: "Informática" },
  { slug: "direito-do-trabalho", name: "Direito do Trabalho e Processual do Trabalho" },
  { slug: "direito-previdenciario", name: "Direito Previdenciário" },
  { slug: "conhecimentos-bancarios", name: "Conhecimentos Bancários" },
  { slug: "atualidades", name: "Atualidades" },
] as const;

// ──────────────────────────────────────────────
// Concursos: cada matéria entra com um peso (%) no edital — usado na
// fórmula de "chance de passar" — e recebe uma fatia do banco de questões
// daquela matéria.
// ──────────────────────────────────────────────

const contestDefinitions = [
  {
    slug: "exemplo-tecnico-judiciario-2026",
    name: "Técnico Judiciário - Área Administrativa",
    organization: "Tribunal Regional Exemplo (fictício)",
    examBoard: "Banca Alfa",
    year: 2026,
    description:
      "Concurso público para provimento de cargos de Técnico Judiciário do Tribunal Regional Exemplo (fictício).",
    examDate: new Date("2026-11-15"),
    subjects: [
      { slug: "portugues", weight: 20, questions: portugues.slice(0, 4) },
      { slug: "raciocinio-logico-matematico", weight: 10, questions: raciocinioLogico.slice(0, 2) },
      { slug: "direito-constitucional", weight: 15, questions: direitoConstitucional.slice(0, 3) },
      { slug: "direito-administrativo", weight: 15, questions: direitoAdministrativo.slice(0, 3) },
      { slug: "informatica", weight: 10, questions: informatica.slice(0, 2) },
      { slug: "direito-do-trabalho", weight: 30, questions: direitoDoTrabalho.slice(0, 6) },
    ],
  },
  {
    slug: "exemplo-tecnico-previdencia-2026",
    name: "Técnico do Seguro Social",
    organization: "Instituto Nacional Exemplo de Previdência (fictício)",
    examBoard: "Banca Beta",
    year: 2026,
    description:
      "Concurso público para provimento de cargos de Técnico do Seguro Social do Instituto Nacional Exemplo de Previdência (fictício).",
    examDate: new Date("2026-12-06"),
    subjects: [
      { slug: "portugues", weight: 15, questions: portugues.slice(4, 7) },
      { slug: "raciocinio-logico-matematico", weight: 10, questions: raciocinioLogico.slice(2, 4) },
      { slug: "direito-constitucional", weight: 15, questions: direitoConstitucional.slice(3, 6) },
      { slug: "direito-administrativo", weight: 10, questions: direitoAdministrativo.slice(3, 5) },
      { slug: "informatica", weight: 10, questions: informatica.slice(2, 4) },
      { slug: "direito-previdenciario", weight: 40, questions: direitoPrevidenciario.slice(0, 8) },
    ],
  },
  {
    slug: "exemplo-escriturario-2026",
    name: "Escriturário",
    organization: "Banco Exemplo S.A. (fictício)",
    examBoard: "Banca Gama",
    year: 2026,
    description: "Concurso público para provimento de cargos de Escriturário do Banco Exemplo (fictício).",
    examDate: new Date("2026-10-18"),
    subjects: [
      { slug: "portugues", weight: 15, questions: portugues.slice(7, 10) },
      { slug: "raciocinio-logico-matematico", weight: 15, questions: raciocinioLogico.slice(4, 7) },
      { slug: "direito-administrativo", weight: 10, questions: direitoAdministrativo.slice(5, 7) },
      { slug: "informatica", weight: 10, questions: informatica.slice(4, 6) },
      { slug: "conhecimentos-bancarios", weight: 40, questions: conhecimentosBancarios.slice(0, 8) },
      { slug: "atualidades", weight: 10, questions: atualidades.slice(0, 2) },
    ],
  },
];

async function main() {
  console.log("Limpando dados existentes...");
  await prisma.userAnswer.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.question.deleteMany();
  await prisma.contestSubject.deleteMany();
  await prisma.contest.deleteMany();
  await prisma.subject.deleteMany();

  console.log("Criando matérias...");
  const subjectsBySlug = new Map<string, { id: string }>();
  for (const subject of subjectDefinitions) {
    const created = await prisma.subject.create({ data: subject });
    subjectsBySlug.set(subject.slug, created);
  }

  let totalQuestions = 0;

  for (const contestDef of contestDefinitions) {
    console.log(`Criando concurso: ${contestDef.name}...`);
    const contest = await prisma.contest.create({
      data: {
        slug: contestDef.slug,
        name: contestDef.name,
        organization: contestDef.organization,
        examBoard: contestDef.examBoard,
        year: contestDef.year,
        description: contestDef.description,
        examDate: contestDef.examDate,
      },
    });

    for (const subjectAllocation of contestDef.subjects) {
      const subject = subjectsBySlug.get(subjectAllocation.slug);
      if (!subject) throw new Error(`Matéria não encontrada: ${subjectAllocation.slug}`);

      await prisma.contestSubject.create({
        data: {
          contestId: contest.id,
          subjectId: subject.id,
          weight: subjectAllocation.weight,
          questionCount: subjectAllocation.questions.length,
        },
      });

      for (const question of subjectAllocation.questions) {
        const labels = ["A", "B", "C", "D", "E"];
        await prisma.question.create({
          data: {
            contestId: contest.id,
            subjectId: subject.id,
            statement: question.statement,
            explanation: question.explanation,
            difficulty: question.difficulty ?? Difficulty.MEDIUM,
            options: {
              create: question.options.map((option, index) => ({
                label: labels[index],
                text: option.text,
                isCorrect: option.correct ?? false,
              })),
            },
          },
        });
        totalQuestions += 1;
      }
    }
  }

  console.log(`Seed concluído: ${contestDefinitions.length} concursos, ${totalQuestions} questões.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
