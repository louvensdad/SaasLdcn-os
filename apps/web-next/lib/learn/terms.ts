import type { Locale } from '@/lib/i18n/locales';

import type { Term } from './types';

type Row = readonly [term: string, meaning: string, where: string];
const rows = (list: readonly Row[]): readonly Term[] => list.map(([term, meaning, where]) => ({ term, meaning, where }));

/**
 * The interface's own vocabulary — words the backend glossary does not have (gap G18).
 * `term` stays the product word in every locale so the same word can be searched and recognized on screen.
 */
export const TERMS: Readonly<Record<Locale, readonly Term[]>> = {
  'en-US': rows([
    ['Project', 'Everything built from one idea: its room, requirements, architecture, missions, runtime and deliveries. Its key is the Project Room id.', 'Projects · every project screen'],
    ['Project Room', 'Where an idea is discussed until it becomes an approved PromptMaster. The room id stays the same from idea to delivery.', 'Discovery · Requirements'],
    ['Mission', 'One run of the Meta-Factory for a project: a generation job (genjob_…) that goes through the pipeline and ends READY, FAILED or paused.', 'Missions · Mission Command Center'],
    ['Guided mission', 'A step-by-step workspace for one of 24 mission types. It prepares the deliverables and hands off to a Project Room.', 'Start · Guided mission'],
    ['Evidence Line', 'The row of stations across a project. Each station is a lifecycle stage with its backend state; select one to open its proof.', 'Every project screen'],
    ['READY', 'The backend’s verdict that a mission finished and passed its gates. READY always links to the evidence behind it.', 'Missions · Evidence'],
    ['Gate', 'A check a mission must pass to advance or to be delivered. Mandatory gates are declared per job.', 'Mission · Evidence · Delivery'],
    ['Evidence', 'A recorded fact behind a verdict: a gate result, a test session, a health check, an exit code.', 'Evidence · Build & Test'],
    ['Decision', 'Something only a person may do — approve, choose, accept, deliver. It waits in the Action Center until the backend state changes.', 'Action Center · diamond signal'],
    ['Virtual company', 'The teams and positions staffed for a mission from the role taxonomy, with who was hired, why, and where capability was missing.', 'Company · Agent'],
    ['Routing refusal', 'A recorded moment when an agent was not assigned, with its code: capability, certification or independence gap.', 'Company'],
    ['Certification', 'The result of an executed suite for a stack, an agent or a composition. Never an average and never self-declared.', 'Certification · Workforce'],
    ['BYOK', 'Bring your own key: AI work runs on your provider key and is billed by your provider. Plans include no AI credits.', 'AI & cost · context bar'],
    ['Estimated cost', 'Tokens multiplied by the provider’s public price. Marked “est.” because the provider’s bill is the real figure.', 'Missions · AI & cost'],
    ['Live · Snapshot', 'Live means an event stream is connected and shows the age of its last event. Snapshot means the data was read once.', 'Mission · Runtime · Platform'],
    ['Workspace', 'Where projects, members and permissions live. Every account has a personal workspace; organizations add team workspaces.', 'Sign-in · Workspace & access'],
  ]),
  'pt-BR': rows([
    ['Projeto', 'Tudo o que nasce de uma ideia: a sala, os requisitos, a arquitetura, as missões, o runtime e as entregas. A chave é o id da Project Room.', 'Projetos · toda tela de projeto'],
    ['Project Room', 'Onde uma ideia é conversada até virar um PromptMaster aprovado. O id da sala é o mesmo da ideia à entrega.', 'Descoberta · Requisitos'],
    ['Missão', 'Uma execução da Meta-Fábrica para um projeto: um job de geração (genjob_…) que percorre o pipeline e termina READY, FAILED ou pausado.', 'Missões · Mission Command Center'],
    ['Missão guiada', 'Um espaço passo a passo para um dos 24 tipos de missão. Prepara os entregáveis e passa para uma Project Room.', 'Começar · Missão guiada'],
    ['Evidence Line', 'A linha de estações de um projeto. Cada estação é uma fase do ciclo de vida com o estado do backend; escolha uma para abrir a prova.', 'Toda tela de projeto'],
    ['READY', 'O veredito do backend de que uma missão terminou e passou pelos gates. READY sempre leva à evidência por trás dele.', 'Missões · Evidência'],
    ['Gate', 'Uma verificação que a missão precisa passar para avançar ou ser entregue. Os gates obrigatórios são declarados por job.', 'Missão · Evidência · Entrega'],
    ['Evidência', 'Um fato registrado por trás de um veredito: resultado de gate, sessão de teste, verificação de saúde, código de saída.', 'Evidência · Build & Test'],
    ['Decisão', 'Algo que só uma pessoa pode fazer — aprovar, escolher, aceitar, entregar. Espera no Action Center até o estado do backend mudar.', 'Action Center · sinal de losango'],
    ['Empresa virtual', 'As equipes e posições montadas para uma missão a partir da taxonomia de papéis: quem foi contratado, por quê e onde faltou capacidade.', 'Empresa · Agente'],
    ['Recusa de roteamento', 'Um momento registrado em que um agente não foi designado, com o código: lacuna de capacidade, de certificação ou de independência.', 'Empresa'],
    ['Certificação', 'O resultado de uma suíte executada para uma stack, um agente ou uma composição. Nunca é média nem autodeclarada.', 'Certificação · Workforce'],
    ['BYOK', 'Traga sua própria chave: o trabalho de IA roda na chave do seu provedor e é cobrado por ele. Os planos não incluem créditos de IA.', 'IA e custo · barra de contexto'],
    ['Custo estimado', 'Tokens multiplicados pelo preço público do provedor. Marcado como “est.” porque a fatura do provedor é o valor real.', 'Missões · IA e custo'],
    ['Ao vivo · Retrato', 'Ao vivo quer dizer que há um stream de eventos conectado, com a idade do último evento. Retrato quer dizer que os dados foram lidos uma vez.', 'Missão · Runtime · Plataforma'],
    ['Workspace', 'Onde ficam projetos, membros e permissões. Toda conta tem um workspace pessoal; organizações acrescentam workspaces de equipe.', 'Entrada · Workspace e acesso'],
  ]),
  'es-ES': rows([
    ['Proyecto', 'Todo lo que nace de una idea: su sala, requisitos, arquitectura, misiones, runtime y entregas. Su clave es el id de la Project Room.', 'Proyectos · toda pantalla de proyecto'],
    ['Project Room', 'Donde se conversa una idea hasta que se convierte en un PromptMaster aprobado. El id de la sala es el mismo de la idea a la entrega.', 'Descubrimiento · Requisitos'],
    ['Misión', 'Una ejecución de la Meta-Factory para un proyecto: un job de generación (genjob_…) que recorre el pipeline y termina READY, FAILED o en pausa.', 'Misiones · Mission Command Center'],
    ['Misión guiada', 'Un espacio paso a paso para uno de los 24 tipos de misión. Prepara los entregables y pasa a una Project Room.', 'Empezar · Misión guiada'],
    ['Evidence Line', 'La fila de estaciones de un proyecto. Cada estación es una fase con su estado en el backend; elige una para abrir su prueba.', 'Toda pantalla de proyecto'],
    ['READY', 'El veredicto del backend de que una misión terminó y pasó sus gates. READY siempre lleva a la evidencia que lo respalda.', 'Misiones · Evidencia'],
    ['Gate', 'Una comprobación que una misión debe superar para avanzar o entregarse. Los gates obligatorios se declaran por job.', 'Misión · Evidencia · Entrega'],
    ['Evidencia', 'Un hecho registrado detrás de un veredicto: resultado de un gate, sesión de pruebas, comprobación de salud, código de salida.', 'Evidencia · Build & Test'],
    ['Decisión', 'Algo que solo una persona puede hacer — aprobar, elegir, aceptar, entregar. Espera en el Action Center hasta que cambie el estado del backend.', 'Action Center · señal de rombo'],
    ['Empresa virtual', 'Los equipos y puestos formados para una misión a partir de la taxonomía de roles: a quién se contrató, por qué y dónde faltó capacidad.', 'Empresa · Agente'],
    ['Rechazo de enrutamiento', 'Un momento registrado en que no se asignó un agente, con su código: brecha de capacidad, de certificación o de independencia.', 'Empresa'],
    ['Certificación', 'El resultado de una suite ejecutada para una stack, un agente o una composición. Nunca es un promedio ni una autodeclaración.', 'Certificación · Workforce'],
    ['BYOK', 'Trae tu propia clave: el trabajo de IA corre con la clave de tu proveedor y lo factura tu proveedor. Los planes no incluyen créditos de IA.', 'IA y costo · barra de contexto'],
    ['Costo estimado', 'Tokens multiplicados por el precio público del proveedor. Marcado como “est.” porque la factura del proveedor es la cifra real.', 'Misiones · IA y costo'],
    ['En vivo · Instantánea', 'En vivo significa que hay un stream de eventos conectado, con la edad de su último evento. Instantánea significa que los datos se leyeron una vez.', 'Misión · Runtime · Plataforma'],
    ['Workspace', 'Donde viven proyectos, miembros y permisos. Toda cuenta tiene un workspace personal; las organizaciones añaden workspaces de equipo.', 'Acceso · Workspace y acceso'],
  ]),
  'fr-FR': rows([
    ['Projet', 'Tout ce qui naît d’une idée : sa salle, ses exigences, son architecture, ses missions, son runtime et ses livraisons. Sa clé est l’id de la Project Room.', 'Projets · chaque écran de projet'],
    ['Project Room', 'Là où une idée est discutée jusqu’à devenir un PromptMaster approuvé. L’id de la salle reste le même de l’idée à la livraison.', 'Découverte · Exigences'],
    ['Mission', 'Une exécution de la Meta-Factory pour un projet : un job de génération (genjob_…) qui parcourt le pipeline et finit READY, FAILED ou en pause.', 'Missions · Mission Command Center'],
    ['Mission guidée', 'Un espace pas à pas pour l’un des 24 types de mission. Il prépare les livrables et passe la main à une Project Room.', 'Commencer · Mission guidée'],
    ['Evidence Line', 'La rangée de stations d’un projet. Chaque station est une phase avec son état backend ; choisissez-en une pour ouvrir sa preuve.', 'Chaque écran de projet'],
    ['READY', 'Le verdict du backend indiquant qu’une mission est terminée et a passé ses gates. READY mène toujours aux preuves qui le justifient.', 'Missions · Preuves'],
    ['Gate', 'Un contrôle qu’une mission doit passer pour avancer ou être livrée. Les gates obligatoires sont déclarés par job.', 'Mission · Preuves · Livraison'],
    ['Preuve', 'Un fait enregistré derrière un verdict : résultat de gate, session de test, contrôle de santé, code de sortie.', 'Preuves · Build & Test'],
    ['Décision', 'Ce que seule une personne peut faire — approuver, choisir, accepter, livrer. Elle attend dans l’Action Center jusqu’à ce que l’état du backend change.', 'Action Center · signal losange'],
    ['Entreprise virtuelle', 'Les équipes et postes composés pour une mission à partir de la taxonomie des rôles : qui a été recruté, pourquoi, et où la compétence manquait.', 'Entreprise · Agent'],
    ['Refus de routage', 'Un moment enregistré où un agent n’a pas été affecté, avec son code : lacune de capacité, de certification ou d’indépendance.', 'Entreprise'],
    ['Certification', 'Le résultat d’une suite exécutée pour une stack, un agent ou une composition. Jamais une moyenne, jamais autodéclarée.', 'Certification · Workforce'],
    ['BYOK', 'Apportez votre propre clé : le travail d’IA tourne sur la clé de votre fournisseur, qui le facture. Les offres n’incluent aucun crédit d’IA.', 'IA et coût · barre de contexte'],
    ['Coût estimé', 'Les tokens multipliés par le prix public du fournisseur. Marqué « est. » car la facture du fournisseur fait foi.', 'Missions · IA et coût'],
    ['En direct · Instantané', 'En direct signifie qu’un flux d’événements est connecté, avec l’âge du dernier événement. Instantané signifie que les données ont été lues une fois.', 'Mission · Runtime · Plateforme'],
    ['Workspace', 'Là où vivent projets, membres et permissions. Chaque compte a un espace personnel ; les organisations ajoutent des espaces d’équipe.', 'Connexion · Espace de travail et accès'],
  ]),
};
