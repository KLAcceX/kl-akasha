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
| **Anúbis** | Triangulação: pesa o que a task pede contra o que foi implementado e o que está no PR | Anúbis, que pesa o coração contra a pena da verdade | 💭 planejado |
| *a definir* | Qualidade de código | | 💭 planejado |
| *a definir* | Segurança | | 💭 planejado |

**Reservados:** **Janus**, deus das portas, para merge, release e deploy, e **Thoth**, o escriba que anota a pesagem, para registro de dívidas e tarefas.

> Todo nome passa pelo conselho antes de entrar aqui.

### Argos: o vigia dos PRs

A meta de volume de PRs faz muitos PRs serem abertos, e os que ficam esquecidos pesam no *stale time*. O Argos existe para que nenhum PR fique parado sem alguém perceber.

Hera mandou Argos vigiar Io. Ele tinha cem olhos e nunca fechava todos ao mesmo tempo. Quando morreu, Hera pôs os olhos dele na cauda do pavão, onde ainda estão abertos.

| Skill | Lenda | O que faz |
|---|---|---|
| `argos-ward` | O que está sob a guarda dele | Vigia os meus PRs abertos (comentários, reviews e pedidos de mudança) e os PRs que esperam a minha revisão. Ordena do mais antigo para o mais novo, porque o mais antigo é o que mais pesa no *stale time*. |
| `argos-pavo` | Os olhos no pavão, que vigiam quando ele não está | Roda o `argos-ward` de tempos em tempos por meio de uma tarefa agendada do Claude, e só notifica quando há novidade. |
| `argos-panoptes` | "O que tudo vê" | Revisa o PR de um colega abrindo de poucos a cem olhos, conforme a criticidade da task. Usa os cenários Gherkin da task como base, sabendo que o QA completa o resto. Anota no fim o que merecer virar outra tarefa. **Ele vê e você julga**: nada é publicado sem a sua aprovação. |

**Os olhos dentro do Claude.** O plugin traz um mod que roda a vigília num timer próprio, sem gastar tokens. Ele mostra uma faixa acima do prompt (`👁 Argos: 1 PR(s) pedem ação · portal#219 conflito`), avisa por toast quando aparece novidade, e o comando `/argos` abre a lista completa num painel. A conta do `gh`, o filtro (ex.: `org:minha-empresa`) e o intervalo se configuram nas opções do plugin. Com várias sessões abertas, só uma roda a vigília em cada intervalo.

**Repositórios conectados.** O comando `/argos repos add <pasta>` lê o `git remote` da pasta (inclusive apelidos de SSH) e conecta o repositório. Depois disso, a vigília olha só os repositórios conectados e passa a incluir **todos os PRs abertos dos colegas**, pedindo ou não a sua revisão. O painel agrupa os PRs por repositório e tem três visões ("Pra corrigir", "Dos outros", "Tudo") e um filtro por autor. Para ver a lista, use `/argos repos`. Para tirar um repositório, use `/argos repos remove <owner/repo>`.

**A criticidade é adaptável.** Primeiro vale a sua régua pessoal (`~/.claude/kl-akasha/criticality.md`, uma seção por repositório). Se não houver, vale a régua padrão do plugin (o Priority do Jira). Se nada for encontrado, a skill pergunta. Labels como `hotfix` e `security` e áreas sensíveis do código só sobem o nível.

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
│           ├── argos-ward/
│           │   └── SKILL.md    # instruções da skill
│           ├── argos-pavo/
│           │   └── SKILL.md
│           └── argos-panoptes/
│               ├── SKILL.md
│               └── references/ # material de apoio carregado sob demanda
│                   └── criticality.md   # régua padrão de criticidade
├── docs/
│   ├── PRD-kl-akasha-v1.md     # o que a v1 entrega e por quê
│   └── conventions.md          # como nomear, criar e versionar skills
└── README.md
```

A configuração pessoal fica **fora** do repositório, em `~/.claude/kl-akasha/`, para não encostar nos repositórios do time.

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
