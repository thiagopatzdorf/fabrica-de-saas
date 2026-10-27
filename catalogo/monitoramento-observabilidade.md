<!-- gerado por scripts/gerar.py; não edite à mão (ver AGENTS.md). Fontes: catalogo/*.yml, catalogo/verificado.json, apps/apps.yml -->

# Monitoramento e observabilidade

*Monitoring and observability*

[Voltar ao catálogo](../README.md) · [Back to the catalog](../README.md)

44 ativos e 0 rebaixados (sem push há mais de 18 meses). Licença, estrelas e atividade conferidas no GitHub em 2026-10-27. Ordenado por estrelas.

| Nome | Substitui | Licença | ★ | Atividade | Stack | Descrição |
|---|---|---|---:|---|---|---|
| [Netdata](https://github.com/netdata/netdata) | Datadog | GPL-3.0 (open core) | 81.2k | 2026-10 | C, JavaScript | Monitoramento em tempo real por segundo com detecção de anomalias e quase nenhuma configuração. *Netdata Cloud é parte proprietária* |
| [Grafana](https://github.com/grafana/grafana) | Datadog, New Relic | AGPL-3.0 (open core) | 77.5k | 2026-10 | Go, TypeScript | Painéis e alertas para métricas, logs e traces vindos de dezenas de fontes de dados. *Edição enterprise e Grafana Cloud pagas* |
| [Prometheus](https://github.com/prometheus/prometheus) | Datadog | Apache-2.0 | 66.8k | 2026-10 | Go | Coleta e armazena métricas como séries temporais, com linguagem de consulta e regras de alerta. |
| [k6](https://github.com/grafana/k6) | BlazeMeter, LoadRunner | AGPL-3.0 | 32.1k | 2026-10 | Go, JavaScript | Ferramenta de teste de carga com scripts em JavaScript e métricas em tempo real. |
| [InfluxDB](https://github.com/influxdata/influxdb) | Datadog, Timestream | Apache-2.0 (open core) | 31.8k | 2026-10 | Rust, Go | Banco de séries temporais para métricas, eventos e dados de sensores. *Parte dos recursos é só da edição comercial* |
| [Grafana Loki](https://github.com/grafana/loki) | Datadog Logs, Splunk | AGPL-3.0 | 29.1k | 2026-10 | Go | Armazena logs indexando só os rótulos, barato de operar e integrado ao Grafana. |
| [Beszel](https://github.com/henrygd/beszel) | Datadog, Netdata | MIT | 26.6k | 2026-10 | Go, TypeScript | Monitor leve de servidores com histórico de CPU, memória, disco e Docker em painel único. |
| [Apache SkyWalking](https://github.com/apache/skywalking) | Dynatrace, New Relic | Apache-2.0 | 25.0k | 2026-10 | Java, Vue | APM para microsserviços e Kubernetes com traces, métricas, topologia e alertas. |
| [Jaeger](https://github.com/jaegertracing/jaeger) | Datadog APM, Lightstep | Apache-2.0 | 23.3k | 2026-10 | Go, TypeScript | Rastreamento distribuído para seguir requisições entre microsserviços e achar gargalos. |
| [Vector](https://github.com/vectordotdev/vector) | Datadog Agent, Splunk Forwarder | MPL-2.0 | 22.8k | 2026-10 | Rust | Pipeline de observabilidade que coleta, transforma e encaminha logs e métricas com alto desempenho. |
| [OpenObserve](https://github.com/openobserve/openobserve) | Datadog, Splunk | AGPL-3.0 (open core) | 22.5k | 2026-10 | Rust, Vue | Plataforma de logs, métricas e traces em binário único, com armazenamento barato em objetos. *Edição enterprise separada* |
| [VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics) | Datadog, Grafana Cloud | Apache-2.0 (open core) | 17.9k | 2026-10 | Go | Banco de séries temporais rápido e econômico, compatível com Prometheus, para monitoramento em escala. *Edição enterprise separada* |
| [Telegraf](https://github.com/influxdata/telegraf) | Datadog Agent | MIT | 17.9k | 2026-10 | Go | Agente que coleta métricas de sistemas, serviços e sensores por mais de 300 plugins. |
| [QuestDB](https://github.com/questdb/questdb) | Timestream | Apache-2.0 | 17.5k | 2026-10 | Java, Rust | Banco de séries temporais de alto desempenho com SQL, para métricas e dados financeiros. |
| [Zipkin](https://github.com/openzipkin/zipkin) | Datadog APM | Apache-2.0 | 17.5k | 2026-08 | Java | Sistema de rastreamento distribuído que coleta e exibe latência entre serviços. |
| [Dozzle](https://github.com/amir20/dozzle) | Papertrail | MIT | 14.7k | 2026-10 | Go, Vue | Visualizador de logs de contêineres Docker em tempo real, direto no navegador. |
| [Thanos](https://github.com/thanos-io/thanos) | Datadog | Apache-2.0 | 14.3k | 2026-10 | Go | Estende o Prometheus com retenção ilimitada, visão global e alta disponibilidade. |
| [Fluentd](https://github.com/fluent/fluentd) | Splunk Forwarder | Apache-2.0 | 13.6k | 2026-10 | Ruby, C | Coletor de dados que unifica a coleta de logs e os envia a muitos destinos por plugins. |
| [Nightingale](https://github.com/ccfos/nightingale) | Datadog, PagerDuty | Apache-2.0 | 13.4k | 2026-10 | Go, JavaScript | Plataforma chinesa de alertas e monitoramento que reúne regras, notificações e painéis. |
| [Quickwit](https://github.com/quickwit-oss/quickwit) | Datadog Logs, Elastic Cloud | Apache-2.0 | 11.7k | 2026-10 | Rust | Motor de busca de logs e traces em armazenamento de objetos, pensado para custo baixo. |
| [Pyroscope](https://github.com/grafana/pyroscope) | Datadog Profiler | AGPL-3.0 | 11.7k | 2026-10 | Go | Profiling contínuo para ver quais funções consomem CPU e memória em produção. |
| [HyperDX](https://github.com/hyperdxio/hyperdx) | Datadog, Sentry | MIT | 10.0k | 2026-10 | TypeScript, ClickHouse | Reúne logs, traces, métricas e replays de sessão numa busca única sobre ClickHouse. |
| [Alertmanager](https://github.com/prometheus/alertmanager) | PagerDuty | Apache-2.0 | 8.7k | 2026-10 | Go | Agrupa, silencia e roteia alertas do Prometheus para e-mail, chat e plantão. |
| [Fluent Bit](https://github.com/fluent/fluent-bit) | Datadog Agent | Apache-2.0 | 8.2k | 2026-10 | C | Coletor leve de logs, métricas e traces para contêineres e dispositivos embarcados. |
| [Coroot](https://github.com/coroot/coroot) | Datadog, Dynatrace | Apache-2.0 (open core) | 8.0k | 2026-10 | Go, Vue | Observabilidade com eBPF que mapeia serviços e aponta a causa raiz de lentidão e falhas. *Edição enterprise paga* |
| [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) | Datadog Agent | Apache-2.0 | 7.7k | 2026-10 | Go | Recebe, processa e exporta telemetria de qualquer fonte para vários backends. |
| [Zabbix](https://github.com/zabbix/zabbix) | SolarWinds, PRTG | AGPL-3.0 | 6.5k | 2026-10 | C, PHP | Monitoramento corporativo de servidores, redes e aplicações com alertas e mapas. |
| [Graphite](https://github.com/graphite-project/graphite-web) | Datadog | Apache-2.0 | 6.1k | 2026-10 | Python | Armazena métricas numéricas de séries temporais e desenha gráficos sob demanda. |
| [Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) | Pingdom | Apache-2.0 | 5.9k | 2026-10 | Go | Sonda endpoints por HTTP, TCP, DNS e ICMP e expõe o resultado como métricas do Prometheus. |
| [Cortex](https://github.com/cortexproject/cortex) | Datadog | Apache-2.0 | 5.9k | 2026-10 | Go | Armazenamento horizontal e multi-inquilino de métricas compatível com Prometheus. |
| [Grafana Tempo](https://github.com/grafana/tempo) | Datadog APM, Honeycomb | AGPL-3.0 | 5.5k | 2026-10 | Go | Backend de traces distribuídos de alto volume, guardado em armazenamento de objetos. |
| [Grafana Mimir](https://github.com/grafana/mimir) | Datadog, Amazon Managed Prometheus | AGPL-3.0 | 5.3k | 2026-10 | Go | Armazenamento de métricas Prometheus em escala, multi-inquilino e de longo prazo. |
| [Parca](https://github.com/parca-dev/parca) | Datadog Profiler | Apache-2.0 | 5.0k | 2026-10 | Go, TypeScript | Profiling contínuo com eBPF que mostra o custo de código em produção sem mudar a aplicação. |
| [Grafana Alloy](https://github.com/grafana/alloy) | Datadog Agent | Apache-2.0 | 3.6k | 2026-10 | Go | Distribuição do coletor OpenTelemetry que envia métricas, logs, traces e perfis. |
| [Kiali](https://github.com/kiali/kiali) | Datadog | Apache-2.0 | 3.6k | 2026-10 | Go, TypeScript | Console de observabilidade para o Istio que mostra a topologia e a saúde da malha de serviços. |
| [Robusta](https://github.com/robusta-dev/robusta) | PagerDuty, Datadog | MIT (open core) | 3.1k | 2026-10 | Python | Enriquece alertas do Prometheus no Kubernetes com contexto e ações automáticas de correção. *Há SaaS pago* |
| [Checkmk](https://github.com/Checkmk/checkmk) | SolarWinds, Datadog | GPL-2.0 (open core) | 2.6k | 2026-10 | Python, C++ | Monitoramento de TI com descoberta automática de serviços em servidores, nuvem e contêineres. *Edições comerciais com recursos extras* |
| [Perses](https://github.com/perses/perses) | Grafana | Apache-2.0 | 2.5k | 2026-10 | Go, TypeScript | Painéis de observabilidade definidos como código, com foco em GitOps e padrão aberto. |
| [VictoriaLogs](https://github.com/VictoriaMetrics/VictoriaLogs) | Datadog Logs, Splunk | Apache-2.0 | 2.4k | 2026-10 | Go | Banco de logs de alto desempenho com pouca memória e consulta por linguagem própria. |
| [Icinga](https://github.com/Icinga/icinga2) | Nagios XI, PRTG | GPL-3.0 | 2.2k | 2026-10 | C++ | Monitoramento de infraestrutura e redes, descendente do Nagios, com configuração por regras. |
| [OpenSearch Dashboards](https://github.com/opensearch-project/OpenSearch-Dashboards) | Kibana, Splunk | Apache-2.0 | 2.1k | 2026-10 | TypeScript | Interface para explorar e visualizar dados e logs do OpenSearch com painéis e alertas. |
| [Nagios Core](https://github.com/NagiosEnterprises/nagioscore) | SolarWinds, PRTG | GPL-2.0 (open core) | 2.1k | 2026-10 | C | Motor clássico de monitoramento de hosts e serviços com notificações e plugins. *Nagios XI é a edição comercial* |
| [Cacti](https://github.com/Cacti/cacti) | PRTG | GPL-2.0 | 1.9k | 2026-10 | PHP | Frontend de gráficos RRDtool para acompanhar tráfego e desempenho de dispositivos de rede. |
| [Centreon](https://github.com/centreon/centreon) | PRTG, SolarWinds | Apache-2.0 (open core) | 168 | 2026-10 | PHP, C++ | Plataforma de monitoramento de infraestrutura e aplicações com mapas e relatórios. *Edições comerciais separadas* |

Falta algum? [Como adicionar](../CONTRIBUTING.md). Missing one? [How to add it](../CONTRIBUTING.md#english).
