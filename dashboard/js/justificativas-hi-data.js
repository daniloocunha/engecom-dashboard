/**
 * Catálogo de justificativas de Horas Improdutivas (HI)
 *
 * ⚠️  ESTE ARQUIVO É GERADO AUTOMATICAMENTE!
 * ⚠️  NÃO EDITE MANUALMENTE!
 *
 * Fonte: app/src/main/res/raw/justificativas_hi.json
 * Gerado em: 2026-07-28T22:47:16.775Z
 * Script: scripts/sync-justificativas-hi.js
 *
 * Para atualizar este arquivo:
 *   1. Edite: app/src/main/res/raw/justificativas_hi.json
 *   2. Execute: node scripts/sync-justificativas-hi.js
 *
 * Consumido por dashboard/js/justificativas-hi.js (classe JustificativasHI).
 */

const JUSTIFICATIVAS_HI_BASE = {
  "versao": 1,
  "descricao": "Catálogo de justificativas de Horas Improdutivas (HI). FONTE ÚNICA DE VERDADE — o app e o dashboard leem daqui. Reclassificar uma justificativa é alterar uma linha deste arquivo; nenhuma regra de negócio no código precisa mudar.",
  "categorias": [
    {
      "id": "NAO_CONTROLAVEL",
      "nome": "Não Controlável",
      "descricao": "Eventos que não dependem da equipe.",
      "cor": "#C62828",
      "ordem": 1
    },
    {
      "id": "CONTROLAVEL",
      "nome": "Controlável",
      "descricao": "Eventos que podem ser reduzidos ou evitados com planejamento.",
      "cor": "#F59E0B",
      "ordem": 2
    },
    {
      "id": "NEUTRO",
      "nome": "Neutro (não conta como HI)",
      "descricao": "Compõem a jornada diária, mas não são perda operacional nem perda da Rumo.",
      "cor": "#3B82F6",
      "ordem": 3
    }
  ],
  "justificativas": [
    {
      "id": "parada_trens",
      "nome": "Parada de Trens",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 20,
      "cor": "#C62828",
      "icone": "train-front",
      "emoji": "🛑",
      "ordem": 10,
      "ativa": true,
      "aliases": [
        "Parada de Trem",
        "Parada de trens"
      ]
    },
    {
      "id": "passagem_trens",
      "nome": "Passagem de Trens",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 20,
      "cor": "#D32F2F",
      "icone": "train-track",
      "emoji": "🚆",
      "ordem": 20,
      "ativa": true,
      "aliases": [
        "Passagens de Trem",
        "Passagem de Trem",
        "Passagens de Trens"
      ]
    },
    {
      "id": "chuva",
      "nome": "Chuva",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 0.5,
      "minutosMinimos": 0,
      "cor": "#1565C0",
      "icone": "cloud-rain",
      "emoji": "🌧️",
      "ordem": 30,
      "ativa": true,
      "aliases": []
    },
    {
      "id": "aguardando_liberacao",
      "nome": "Aguardando Liberação",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#AD1457",
      "icone": "clock-alert",
      "emoji": "⏳",
      "ordem": 40,
      "ativa": true,
      "aliases": [
        "Aguardando liberação",
        "Aguardando Liberacao"
      ]
    },
    {
      "id": "intersticio",
      "nome": "Interstício",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#6A1B9A",
      "icone": "hourglass",
      "emoji": "⏱️",
      "ordem": 50,
      "ativa": true,
      "aliases": [
        "Intersticio"
      ]
    },
    {
      "id": "temperatura_via",
      "nome": "Temperatura da Via",
      "categoria": "NAO_CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#EF6C00",
      "icone": "thermometer",
      "emoji": "🌡️",
      "ordem": 60,
      "ativa": true,
      "aliases": [
        "Temperatura de Via",
        "Temperatura da via"
      ]
    },
    {
      "id": "falta_material",
      "nome": "Falta de Material",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#F59E0B",
      "icone": "package",
      "emoji": "📦",
      "ordem": 100,
      "ativa": true,
      "aliases": [
        "Falta de material"
      ]
    },
    {
      "id": "aguardando_faixa",
      "nome": "Aguardando Faixa",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#FB8C00",
      "icone": "traffic-cone",
      "emoji": "🚧",
      "ordem": 110,
      "ativa": true,
      "aliases": [
        "Aguardando faixa"
      ]
    },
    {
      "id": "trabalho_sem_escopo",
      "nome": "Trabalho sem Escopo",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#E65100",
      "icone": "file-question",
      "emoji": "❓",
      "ordem": 120,
      "ativa": true,
      "aliases": [
        "Trabalho sem escopo",
        "Serviço sem escopo"
      ]
    },
    {
      "id": "finalizacao_os",
      "nome": "Finalização de O.S.",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#FF8F00",
      "icone": "clipboard-check",
      "emoji": "📋",
      "ordem": 130,
      "ativa": true,
      "aliases": [
        "Finalizacao de OS",
        "Finalização de OS",
        "Finalização de O.S"
      ]
    },
    {
      "id": "deslocamento",
      "nome": "Deslocamento",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#F9A825",
      "icone": "footprints",
      "emoji": "🥾",
      "ordem": 140,
      "ativa": true,
      "aliases": [
        "Deslocamento a Pé",
        "Deslocamento a pe"
      ]
    },
    {
      "id": "treinamento",
      "nome": "Treinamento",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#C0CA33",
      "icone": "graduation-cap",
      "emoji": "🎓",
      "ordem": 150,
      "ativa": true,
      "aliases": []
    },
    {
      "id": "outros",
      "nome": "Outros",
      "categoria": "CONTROLAVEL",
      "considerarHI": true,
      "considerarPerdaRumo": true,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#8D6E63",
      "icone": "circle-help",
      "emoji": "📝",
      "ordem": 160,
      "ativa": true,
      "exigeDescricao": true,
      "aliases": [
        "Outro"
      ]
    },
    {
      "id": "almoco",
      "nome": "Almoço / Refeição",
      "categoria": "NEUTRO",
      "considerarHI": false,
      "considerarPerdaRumo": false,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#3B82F6",
      "icone": "utensils",
      "emoji": "🍽️",
      "ordem": 200,
      "ativa": true,
      "aliases": [
        "Almoço/Refeição",
        "Almoco/Refeicao",
        "Almoço",
        "Refeição"
      ]
    },
    {
      "id": "dds",
      "nome": "DDS",
      "categoria": "NEUTRO",
      "considerarHI": false,
      "considerarPerdaRumo": false,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#5C6BC0",
      "icone": "megaphone",
      "emoji": "📢",
      "ordem": 210,
      "ativa": true,
      "aliases": [
        "D.D.S",
        "D.D.S.",
        "Diálogo Diário de Segurança"
      ]
    },
    {
      "id": "transito",
      "nome": "Trânsito",
      "categoria": "NEUTRO",
      "considerarHI": false,
      "considerarPerdaRumo": false,
      "fatorHH": 1,
      "minutosMinimos": 0,
      "cor": "#607D8B",
      "icone": "car",
      "emoji": "🚗",
      "ordem": 220,
      "ativa": true,
      "aliases": [
        "Transito"
      ]
    }
  ]
};
