<div align="center">

# KL · Akasha

**O registro de todo o saber: biblioteca pessoal de skills para IA.**

![Status](https://img.shields.io/badge/status-em%20constru%C3%A7%C3%A3o-orange)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-D97757?logo=anthropic&logoColor=white)
![Plugins](https://img.shields.io/badge/plugins-1-blue)
![Skills](https://img.shields.io/badge/skills-3-blue)
![Idioma](https://img.shields.io/badge/idioma-pt--BR-green)

</div>

---

## Em resumo

| | |
|---|---|
| **O que é** | Uma coleção de skills para Claude Code, organizadas por domínio e instaláveis como plugins |
| **Para quem** | Para mim no trabalho e em qualquer outro projeto onde eu use IA |
| **Primeiro domínio** | Pull requests: revisar, vigiar e não deixar nenhum PR envelhecer |
| **Formato** | Marketplace de plugins do Claude Code: cada domínio é um plugin e cada plugin tem as suas skills |

---

## Por que "Akasha"

Em sânscrito, *ākāśa* é o éter, o espaço que contém todas as coisas. Mais tarde várias tradições adotaram a ideia dos **registros akáshicos**, uma biblioteca cósmica onde ficaria guardado todo o conhecimento que já existiu.

É isso que este repositório quer ser: o lugar onde fica guardado cada "como fazer" que vale a pena ensinar a uma IA.

Ele é irmão do [`kl-ouroboros`](#), a serpente que devora a própria cauda.

---

## Panteão

Cada domínio recebe o nome de uma entidade, tirada de qualquer mitologia, cuja natureza combina com a função do domínio.

| Plugin | Domínio | Origem do nome | Status |
|---|---|---|---|
| **Argos** | Pull requests | Argos Panoptes, o gigante de cem olhos que nunca dormia por inteiro | 🚧 em construção |
| *a definir* | Qualidade de código | | 💭 planejado |
| *a definir* | Segurança | | 💭 planejado |
| *a definir* | Tarefas: cruza o que a task pede com o que foi implementado e o que está no PR | | 💭 planejado |

### Argos: o vigia dos PRs

A meta de volume de PRs faz muitos PRs serem abertos, e os que ficam esquecidos pesam no *stale time*. O Argos existe para que nenhum PR fique parado sem alguém perceber.

| Skill | O que faz |
|---|---|
| `argos-review` | Revisa o PR de um colega. O rigor da revisão acompanha a criticidade da task: task crítica recebe revisão metódica de tudo, task menos crítica recebe revisão mais leve. Usa os cenários Gherkin da task como base, sabendo que eles não cobrem tudo, porque o QA completa os cenários depois. O que merecer virar outra tarefa fica anotado no fim. |
| `argos-watch` | Vigia os meus PRs abertos: comentários, reviews, pedidos de mudança, tudo o que pede atualização. Ordena do mais antigo para o mais novo, porque o mais antigo é o que mais pesa no *stale time*. |
| `argos-patrol` | Roda o `argos-watch` (e, opcionalmente, a fila de reviews) de tempos em tempos por meio de uma tarefa agendada do Claude, e notifica quando há novidade. |

---

## Arquitetura

```
kl-akasha/
├── .claude-plugin/
│   └── marketplace.json        # catálogo: lista todos os plugins do repositório
├── plugins/
│   └── argos/                  # um domínio = um plugin = uma entidade
│       ├── .claude-plugin/
│       │   └── plugin.json     # nome, versão e descrição do plugin
│       ├── README.md           # o que o domínio cobre e as suas skills
│       └── skills/
│           ├── argos-review/
│           │   ├── SKILL.md    # instruções da skill
│           │   └── references/ # material de apoio carregado sob demanda
│           ├── argos-watch/
│           │   └── SKILL.md
│           └── argos-patrol/
│               └── SKILL.md
├── docs/
│   └── conventions.md          # como nomear, criar e versionar skills
└── README.md
```

### Regras de organização

1. **Um domínio, um plugin.** Qualidade de código, segurança e tarefas vão cada um para a sua pasta em `plugins/`. Quem procura algo de PR olha em `plugins/argos/` e em nenhum outro lugar.
2. **A skill tem o prefixo da entidade.** É `argos-review`, não `review`. Assim o nome nunca colide com uma skill de outro plugin, e na hora de invocar dá para saber de onde ela veio.
3. **Cada plugin se basta.** Quando o Claude Code instala um plugin, ele copia só a pasta daquele plugin, então nada pode depender de arquivos de fora dela. Uma regra compartilhada entre domínios (por exemplo, a régua de criticidade) é copiada para dentro de cada plugin que a usa, e o `docs/conventions.md` diz qual cópia é a fonte.
4. **O `SKILL.md` fica enxuto.** Checklists, réguas e modelos longos vão para `references/` e só são carregados quando a skill precisa deles.
5. **Dá para instalar só uma parte.** Como cada domínio é um plugin, um projeto pode instalar só o Argos sem trazer o resto.

---

<div align="center">

*Uso e instalação: em breve.*

</div>
