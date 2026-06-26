# Cliente Máquina Zero-Trust 🤖🔒

Este repositório contém o código de uma Prova de Conceito (PoC) para um ecossistema financeiro baseado na economia de **"Clientes Máquina" (Machine-to-Machine - M2M)**. 

A aplicação simula uma infraestrutura agêntica de conformidade e pagamento autônomo na borda. O agente local de inteligência artificial (Gemma 4 E2B) monitora a telemetria do hardware, toma decisões de compra autônomas, liquida as transações pelo protocolo **x450/x402 (Mastercard AP4M)** com assinatura RSA digital e transmite os dados criptografados em mTLS pela malha de rede overlay Zero-Trust do **OpenZiti**.

---

## 🚀 Visão Geral e Arquitetura

O sistema é construído sobre o **Next.js 16 (App Router)** e opera localmente em uma abordagem *offline-first*. O fluxo das transações ocorre da seguinte forma:

```text
[Sensores Telemetria] ──(Nível Baixo)──> [Gemma 4 E2B Local] ──(JSON de Compra)──> [Guard Mode] 
                                                                                        │
                                                                                    (Aprovado)
                                                                                        ▼
[Receita de Liquidação] <──(mTLS Túnel)── [Serviço Escuro Ziti] <─── [API Gateway / OpenZiti SDK]
```

1.  **Monitoramento de Telemetria (Insumos)**: Os recursos operacionais da máquina (núcleos de processamento em nuvem e nível de fluido refrigerante) são drenados constantemente.
2.  **Motor de Decisão (Gemma 4 E2B)**: Quando os insumos atingem um nível crítico (abaixo de 20%), o motor local de IA é acionado com um Prompt de Sistema específico. Utilizando um modo de pensamento estruturado (`<|think|>`), o modelo calcula a quantidade necessária, o fornecedor ideal e cospe um JSON com a intenção de compra.
3.  **Controle de Políticas (Guard Mode)**: A aplicação intercepta o JSON gerado e o avalia contra as regras locais de limite de gasto diário e allowlist de fornecedores (inspirado na MetaMask Agent Wallet).
4.  **Transmissão Segura (OpenZiti)**: Transações aprovadas são enviadas ao backend Next.js, que estabelece um canal mTLS criptografado por software via SDK do OpenZiti para liquidar o pagamento no fornecedor de forma 100% escura (sem expor portas públicas no host).

---

## ✨ Funcionalidades Principais

*   **Prompt Center e Motor Local**: Controle visual do prompt de sistema injetado no Gemma E2B e exibição interativa da cadeia de raciocínio lógico em blocos de pensamento.
*   **Protocolo de Liquidação M2M (x402)**: Geração de payloads estruturados em micro-centavos com suporte a assinaturas digitais RSA-256 geradas pelo próprio assinador do agente.
*   **Wallet Guard Mode**: Middleware local para bloqueio preventivo de gastos excessivos ou comunicação com fornecedores não homologados.
*   **Grafo de Rede OpenZiti**: Visualizador dinâmico da topologia overlay com logs criptográficos de handshakes TLS e encriptação AES-256-GCM.
*   **Ledger Histórico**: Banco de auditoria criptográfica local (LocalStorage) para inspeção de transações liquidadas ou bloqueadas pelo Guard Mode.

---

## 🏗️ Estrutura do Projeto

```text
src/
├── app/
│   ├── api/transmit-ziti/    # Gateway para encapsulamento de chamadas OpenZiti
│   ├── ledger/               # Página de auditoria do livro transacional
│   ├── network/              # Visualizações de topologia de rede overlay
│   ├── security/             # Painel de limites de conformidade e chaves RSA
│   ├── globals.css           # Estilos globais e tokens visuais
│   ├── layout.tsx            # Layout principal
│   └── page.tsx              # Página inicial do simulador
├── components/
│   ├── layout/sidebar.tsx    # Menu lateral de navegação
│   ├── MachineCustomerSimulator.tsx # Dashboard de controle do Cliente Máquina
│   └── ...
├── hooks/
│   └── use-simulation.tsx    # React Context que orquestra a telemetria e o fluxo AI
└── lib/
    ├── agent_pay_protocol.ts # Protocolo x402 e utilitários de criptografia
    ├── AgentGuardMode.ts     # Middleware de conformidade e orçamentos
    ├── constants.ts          # Definições de rotas e fornecedores aprovados
    └── ziti_server.ts        # Integração e logs do SDK OpenZiti
```

---

## ⚙️ Configuração e Execução

### Pré-requisitos
*   **Node.js**: v20 ou superior
*   **npm**: v10 ou superior

### Inicialização
1.  Instale as dependências locais:
    ```bash
    npm install
    ```
2.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
3.  Acesse `http://localhost:3000` no seu navegador.

### Compilação de Produção
Para verificar a integridade estrita e compilar a aplicação para produção:
```bash
npm run build
```

---

## 🛡️ Integração Nativa do OpenZiti

Por padrão, a aplicação executa em **Modo de Simulação de Alta Fidelidade**, gerando logs detalhados de PKI e controle de rede. Para transacionar em uma rede overlay real:

1.  Suba uma controladora OpenZiti local (por exemplo, via Docker Quickstart).
2.  Crie as identidades e o serviço correspondente (`ap4m-settlement-service`).
3.  Efetue o enrollment da identidade do cliente gerando o certificado `ziti-identity.json`.
4.  Mova o arquivo `ziti-identity.json` para a raiz deste diretório. O backend Next.js fará o bootstrap nativo mTLS automaticamente!

*Veja as instruções completas de CLI e Docker no arquivo de roteamento de auditoria.*
