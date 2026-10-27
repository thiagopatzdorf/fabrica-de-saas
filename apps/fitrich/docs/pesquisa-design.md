# Pesquisa: design, onboarding, texto e acessibilidade

O que foi lido e o que foi decidido (o que foi medido vence o que foi lido).

- **Estados vazios** ([NN/g, empty states](https://www.nngroup.com/articles/empty-state-interface-design/); [setproduct](https://www.setproduct.com/blog/empty-state-ui-design)): "momento de ensinar", roteiro O quê? Por quê? E agora?. Decidi uma peça única (`ctx.estadoVazio`) com ícone, título, uma frase e no máximo duas ações, em todas as telas que já existem.
- **Onboarding** ([useronboard](https://www.useronboard.com/onboarding-ux-patterns/empty-states/), [guia de apps móveis](https://www.rapidnative.com/blogs/user-onboarding-best-practices)): ajuda no contexto vence tutorial forçado. Decidi 3 passos curtos, tudo opcional, pular em todos, e o objetivo escolhido só muda o que aparece primeiro.
- **WCAG 2.2** ([W3C](https://www.w3.org/TR/WCAG22/), [TetraLogical](https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2/)): alvo mínimo 24 px (2.5.8) e foco com área e contraste 3:1 (2.4.13). O app já exigia 44 px; mantive 44 px e foco de 3 px com halo. Contraste de texto 4,5:1 e de componente 3:1, medidos por script.
- **Apps de finanças** (Copilot, Monarch, YNAB; [comparativo](https://era.app/articles/era-vs-monarch-vs-copilot-vs-ynab/)): o consenso é calma e pouca densidade; a fonte não detalha microcopy, então o tom ("sem culpa, o meio-termo") vem do contrato do app (`ui-v2.md`) e foi imposto por teste de vocabulário.
- **Paleta:** o validador do dataviz mostrou que o `--agua` antigo reprovava o piso de croma; separei marca (`--agua`) e texto (`--agua-t`).
- **Decisão sobre "grego":** proporção e contenção, nada de mármore ou fonte "grega". Escala √φ, espaço de Fibonacci, um acento de azeite.
- **Não pesquisado a fundo:** psicologia de cor por cultura e tamanhos ótimos de onboarding por coorte; sem dado nosso, ficaram como hipótese.
