import type { Locale } from '@/lib/i18n/locales';

import type { SignalMeaning } from './types';

/** What each signal family means, in every locale. The family names themselves come from the `signal.*` messages. */
export const SIGNAL_MEANINGS: Readonly<Record<Locale, readonly SignalMeaning[]>> = {
  'en-US': [
    { family: 'proof', shape: 'filled circle with a check', meaning: 'The backend recorded proof: passed, certified, approved, READY.' },
    { family: 'pulse', shape: 'turning arc', meaning: 'Work is happening now. It turns only while an event stream is actually connected.' },
    { family: 'hand', shape: 'diamond', meaning: 'Only a person can move this forward. The one color reserved for decisions.' },
    { family: 'caution', shape: 'triangle', meaning: 'It worked with a reservation, or something needs attention soon — a stale key, a refused routing.' },
    { family: 'fault', shape: 'square with a cross', meaning: 'It ran and failed. The failure keeps its reason and its evidence.' },
    { family: 'stop', shape: 'circle with a pause', meaning: 'Paused, cancelled, archived or superseded on purpose.' },
    { family: 'idle', shape: 'dashed circle', meaning: 'Nothing has run yet. Not a failure and not a success.' },
    { family: 'na', shape: 'dash', meaning: 'This does not exist for this project — for example mobile steps on a web project.' },
    { family: 'unknown', shape: 'dashed circle with a question mark', meaning: 'The interface could not read this. It never turns unknown into healthy.' },
  ],
  'pt-BR': [
    { family: 'proof', shape: 'círculo cheio com um visto', meaning: 'O backend registrou prova: passou, certificado, aprovado, READY.' },
    { family: 'pulse', shape: 'arco girando', meaning: 'Há trabalho acontecendo agora. Só gira enquanto um stream de eventos está de fato conectado.' },
    { family: 'hand', shape: 'losango', meaning: 'Só uma pessoa pode fazer isto avançar. A única cor reservada para decisões.' },
    { family: 'caution', shape: 'triângulo', meaning: 'Funcionou com ressalva, ou algo precisa de atenção em breve — uma chave antiga, um roteamento recusado.' },
    { family: 'fault', shape: 'quadrado com um X', meaning: 'Rodou e falhou. A falha guarda o motivo e a evidência.' },
    { family: 'stop', shape: 'círculo com pausa', meaning: 'Pausado, cancelado, arquivado ou substituído de propósito.' },
    { family: 'idle', shape: 'círculo tracejado', meaning: 'Nada rodou ainda. Não é falha nem sucesso.' },
    { family: 'na', shape: 'traço', meaning: 'Isto não existe neste projeto — por exemplo, etapas mobile num projeto web.' },
    { family: 'unknown', shape: 'círculo tracejado com interrogação', meaning: 'A interface não conseguiu ler isto. Desconhecido nunca vira saudável.' },
  ],
  'es-ES': [
    { family: 'proof', shape: 'círculo relleno con una marca', meaning: 'El backend registró una prueba: aprobado, certificado, READY.' },
    { family: 'pulse', shape: 'arco que gira', meaning: 'Hay trabajo en marcha. Solo gira mientras un stream de eventos está conectado de verdad.' },
    { family: 'hand', shape: 'rombo', meaning: 'Solo una persona puede hacer avanzar esto. El único color reservado para decisiones.' },
    { family: 'caution', shape: 'triángulo', meaning: 'Funcionó con una reserva, o algo necesitará atención pronto — una clave antigua, un enrutamiento rechazado.' },
    { family: 'fault', shape: 'cuadrado con una cruz', meaning: 'Se ejecutó y falló. El fallo conserva su motivo y su evidencia.' },
    { family: 'stop', shape: 'círculo con pausa', meaning: 'En pausa, cancelado, archivado o sustituido a propósito.' },
    { family: 'idle', shape: 'círculo discontinuo', meaning: 'Todavía no se ejecutó nada. No es un fallo ni un éxito.' },
    { family: 'na', shape: 'guion', meaning: 'Esto no existe en este proyecto — por ejemplo, pasos móviles en un proyecto web.' },
    { family: 'unknown', shape: 'círculo discontinuo con interrogación', meaning: 'La interfaz no pudo leer esto. Lo desconocido nunca se muestra como saludable.' },
  ],
  'fr-FR': [
    { family: 'proof', shape: 'cercle plein avec une coche', meaning: 'Le backend a enregistré une preuve : réussi, certifié, approuvé, READY.' },
    { family: 'pulse', shape: 'arc qui tourne', meaning: 'Un travail est en cours. Il ne tourne que si un flux d’événements est réellement connecté.' },
    { family: 'hand', shape: 'losange', meaning: 'Seule une personne peut faire avancer ceci. La seule couleur réservée aux décisions.' },
    { family: 'caution', shape: 'triangle', meaning: 'Cela a fonctionné avec une réserve, ou quelque chose demandera bientôt de l’attention — une clé ancienne, un routage refusé.' },
    { family: 'fault', shape: 'carré avec une croix', meaning: 'Cela a tourné et échoué. L’échec garde sa raison et sa preuve.' },
    { family: 'stop', shape: 'cercle avec pause', meaning: 'En pause, annulé, archivé ou remplacé volontairement.' },
    { family: 'idle', shape: 'cercle en pointillés', meaning: 'Rien n’a encore tourné. Ce n’est ni un échec ni une réussite.' },
    { family: 'na', shape: 'tiret', meaning: 'Cela n’existe pas pour ce projet — par exemple des étapes mobiles sur un projet web.' },
    { family: 'unknown', shape: 'cercle en pointillés avec un point d’interrogation', meaning: 'L’interface n’a pas pu lire ceci. L’inconnu ne devient jamais « sain ».' },
  ],
};
