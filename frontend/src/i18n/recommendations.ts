import type { Recommendation } from "../types";
import type { Language } from "./language";
import { CATALOG_I18N } from "./catalogI18n";

export interface RecommendationText {
  /** What to do — short and imperative. */
  title: string;
  /** Why, in measured numbers. */
  detail: string;
  /** How to do it in this tool. */
  action: string;
  /** What it buys you, where that's computable. */
  impact?: string;
}

function typeLabel(typeKey: string, language: Language): string {
  return CATALOG_I18N[typeKey]?.[language]?.label ?? typeKey;
}

function rps(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}k`;
  return Math.round(value).toString();
}

type Builder = (d: Record<string, never>, lang: Language) => RecommendationText;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILDERS: Record<string, (d: any, lang: Language) => RecommendationText> = {
  scale_out: (d, lang) => {
    const shedding = d.dropped > 0;
    if (lang === "ru") {
      const kind = d.is_datastore ? "реплик" : "экземпляров";
      return {
        title: `Масштабировать «${d.name}»: ${d.current_replicas} → ${d.needed_replicas} ${kind}`,
        detail: shedding
          ? `Компонент получает ${rps(d.offered)} rps при ёмкости ${rps(d.capacity)} rps и отбрасывает ${rps(d.dropped)} rps. Задержка выросла до ${Math.round(d.latency_ms)} мс.`
          : `Компонент работает на 100% ёмкости (${rps(d.offered)} из ${rps(d.capacity)} rps) — запаса нет, любой всплеск приведёт к потерям. Задержка уже ${Math.round(d.latency_ms)} мс.`,
        action: d.is_datastore
          ? `Выберите «${d.name}» и задайте «Реплики» = ${d.needed_replicas}. Для реляционной БД это read-реплики: пишем в primary, читаем с реплик.`
          : `Выберите «${d.name}» и задайте «Реплики» = ${d.needed_replicas}. Убедитесь, что перед ним стоит балансировщик нагрузки.`,
        impact: `${d.needed_replicas} × ${rps(d.per_replica)} rps = ${rps(d.needed_replicas * d.per_replica)} rps ёмкости — хватит для текущих ${rps(d.offered)} rps.`,
      };
    }
    const kind = d.is_datastore ? "replicas" : "instances";
    return {
      title: `Scale out "${d.name}": ${d.current_replicas} → ${d.needed_replicas} ${kind}`,
      detail: shedding
        ? `Taking ${rps(d.offered)} rps against ${rps(d.capacity)} rps of capacity and shedding ${rps(d.dropped)} rps. Latency has climbed to ${Math.round(d.latency_ms)} ms.`
        : `Running at 100% of capacity (${rps(d.offered)} of ${rps(d.capacity)} rps) — no headroom, so any spike starts dropping. Latency is already ${Math.round(d.latency_ms)} ms.`,
      action: d.is_datastore
        ? `Select "${d.name}" and set Replicas to ${d.needed_replicas}. For a relational DB that means read replicas — writes to the primary, reads spread across replicas.`
        : `Select "${d.name}" and set Replicas to ${d.needed_replicas}. Make sure a load balancer fronts them.`,
      impact: `${d.needed_replicas} × ${rps(d.per_replica)} rps = ${rps(d.needed_replicas * d.per_replica)} rps of capacity, enough for the current ${rps(d.offered)} rps.`,
    };
  },

  no_headroom: (d, lang) =>
    lang === "ru"
      ? {
          title: `Нет запаса ёмкости у «${d.name}»`,
          detail: `Загрузка ${d.utilization_pct}%, свободно всего ${rps(d.headroom_rps)} rps из ${rps(d.capacity)} rps.`,
          action: `Добавьте реплику «${d.name}» или снимите с него нагрузку кэшем либо асинхронной обработкой.`,
          impact: "Появится запас на всплески трафика и на выход из строя одного экземпляра.",
        }
      : {
          title: `"${d.name}" has no headroom`,
          detail: `Running at ${d.utilization_pct}% utilization — only ${rps(d.headroom_rps)} rps spare out of ${rps(d.capacity)} rps.`,
          action: `Add a replica to "${d.name}", or take load off it with a cache or async processing.`,
          impact: "Leaves room for traffic spikes and for losing one instance.",
        },

  add_cache: (d, lang) =>
    lang === "ru"
      ? {
          title: `Добавить кэш перед «${d.name}»`,
          detail: `Хранилище принимает ${rps(d.offered)} rps напрямую — выше по потоку нет ни одного кэша.`,
          action: `Перетащите «Кэш приложения» на холст и соедините${d.upstream_name ? ` «${d.upstream_name}»` : " сервис приложения"} с ним, оставив связь с «${d.name}» для промахов.`,
          impact: `При попадании ${d.hit_ratio_pct}% нагрузка на «${d.name}» упадёт с ${rps(d.offered)} до ${rps(d.projected_offered)} rps (${d.projected_util_pct}% ёмкости)${d.solves ? " — этого достаточно, чтобы уйти от перегрузки" : ", но одного кэша не хватит"}.`,
        }
      : {
          title: `Put a cache in front of "${d.name}"`,
          detail: `The datastore is absorbing ${rps(d.offered)} rps directly — there's no cache anywhere upstream of it.`,
          action: `Drop an App Cache onto the canvas and connect ${d.upstream_name ? `"${d.upstream_name}"` : "the app tier"} to it, keeping the link to "${d.name}" for misses.`,
          impact: `At a ${d.hit_ratio_pct}% hit ratio, load on "${d.name}" falls from ${rps(d.offered)} to ${rps(d.projected_offered)} rps (${d.projected_util_pct}% of capacity)${d.solves ? " — enough to clear the overload" : ", though a cache alone won't be enough"}.`,
        },

  add_queue: (d, lang) =>
    lang === "ru"
      ? {
          title: `Развязать запись в «${d.name}» очередью`,
          detail: `Хранилище получает ${rps(d.offered)} rps при ёмкости ${rps(d.capacity)} rps, и всплески бьют по нему напрямую.`,
          action: "Добавьте «Очередь сообщений» и «Очередь задач / воркер»: приложение пишет в очередь (протокол связи — async_queue), воркер разгребает её в БД в своём темпе.",
          impact: "Всплески трафика буферизуются вместо потерь; клиент перестаёт ждать запись.",
        }
      : {
          title: `Decouple writes to "${d.name}" with a queue`,
          detail: `The datastore takes ${rps(d.offered)} rps against ${rps(d.capacity)} rps of capacity, and bursts hit it head-on.`,
          action: "Add a Message Queue and a Task Queue / Worker: the app publishes to the queue (set the connection protocol to async_queue) and the worker drains it into the DB at its own pace.",
          impact: "Bursts get buffered instead of dropped, and the client stops waiting on the write.",
        },

  add_redundancy: (d, lang) =>
    lang === "ru"
      ? {
          title: `Зарезервировать «${d.name}» — единая точка отказа`,
          detail: `Через компонент идёт ${rps(d.rps)} rps в одном экземпляре при доступности ${d.availability_pct}%. Его отказ обрывает этот путь целиком.`,
          action: `Выберите «${d.name}» и задайте «Реплики» ≥ 2, поставив перед ним балансировщик нагрузки.`,
          impact: `Две реплики поднимают доступность узла с ${d.availability_pct}% до ~${(100 - Math.pow(1 - d.availability_pct / 100, 2) * 100).toFixed(3)}%.`,
        }
      : {
          title: `Make "${d.name}" redundant — it's a single point of failure`,
          detail: `It carries ${rps(d.rps)} rps as a single instance at ${d.availability_pct}% availability. Losing it takes out this path entirely.`,
          action: `Select "${d.name}", set Replicas to 2 or more, and front them with a load balancer.`,
          impact: `Two replicas lift this node from ${d.availability_pct}% to about ${(100 - Math.pow(1 - d.availability_pct / 100, 2) * 100).toFixed(3)}%.`,
        },

  add_load_balancer: (d, lang) =>
    lang === "ru"
      ? {
          title: `Поставить балансировщик перед «${typeLabel(d.type, lang)}»`,
          detail: `${d.count} экземпляра(ов) принимают ${rps(d.rps)} rps от общего источника, но балансировщика перед ними нет.`,
          action: "Добавьте «Балансировщик нагрузки» и заведите трафик через него на все экземпляры.",
          impact: "Равномерное распределение нагрузки и автоматический вывод отказавшего экземпляра из ротации.",
        }
      : {
          title: `Front the ${typeLabel(d.type, lang)} tier with a load balancer`,
          detail: `${d.count} instances take ${rps(d.rps)} rps from a shared upstream with no balancer in between.`,
          action: "Add a Load Balancer and route the traffic through it to every instance.",
          impact: "Even load distribution, and a failed instance drops out of rotation automatically.",
        },

  insert_app_layer: (d, lang) =>
    lang === "ru"
      ? {
          title: `Убрать прямой доступ клиента к «${d.name}»`,
          detail: `Клиент обращается к хранилищу напрямую — ${rps(d.rps)} rps в обход прикладного слоя.`,
          action: `Добавьте «Сервер приложений» или «API-шлюз» между клиентом и «${d.name}» и удалите прямую связь.`,
          impact: "Появляется место для авторизации, валидации, кэширования и ограничения нагрузки.",
        }
      : {
          title: `Stop the client talking to "${d.name}" directly`,
          detail: `The client reaches the datastore directly — ${rps(d.rps)} rps bypassing any application layer.`,
          action: `Add an App Server or API Gateway between the client and "${d.name}", then delete the direct connection.`,
          impact: "Gives you somewhere to put auth, validation, caching, and rate limiting.",
        },

  add_cdn: (d, lang) =>
    lang === "ru"
      ? {
          title: "Вынести статику на CDN",
          detail: `Весь трафик (${rps(d.rps)} rps) идёт до origin, включая статику и кэшируемые ответы.`,
          action: "Добавьте компонент CDN между клиентом и точкой входа.",
          impact: "Статика отдаётся с периметра: меньше задержка у пользователя и меньше нагрузка на origin.",
        }
      : {
          title: "Serve static content from a CDN",
          detail: `All ${rps(d.rps)} rps travels to origin, including static assets and cacheable responses.`,
          action: "Add a CDN component between the client and your entry point.",
          impact: "Static content is served from the edge — lower user-perceived latency and less origin load.",
        },

  latency_over_budget: (d, lang) =>
    lang === "ru"
      ? {
          title: "Задержка превышает заданный бюджет",
          detail: `Критический путь занимает ${Math.round(d.measured_ms)} мс при бюджете ${d.budget_ms} мс. Основной вклад — «${d.worst_name}» (${Math.round(d.worst_ms)} мс).`,
          action: `Разгрузите «${d.worst_name}»: добавьте реплики, поставьте перед ним кэш или вынесите часть работы в асинхронную обработку.`,
          impact: "Задержка растёт нелинейно у насыщенных компонентов — снятие нагрузки даёт непропорционально большой выигрыш.",
        }
      : {
          title: "Latency is over the declared budget",
          detail: `The critical path takes ${Math.round(d.measured_ms)} ms against a ${d.budget_ms} ms budget. "${d.worst_name}" is the biggest contributor at ${Math.round(d.worst_ms)} ms.`,
          action: `Relieve "${d.worst_name}": add replicas, put a cache in front of it, or move work off the request path into async processing.`,
          impact: "Latency rises non-linearly once a component saturates, so taking load off it pays back disproportionately.",
        },

  throughput_below_target: (d, lang) =>
    lang === "ru"
      ? {
          title: "Требуемая пропускная способность не достигнута",
          detail: `Обрабатывается ${rps(d.served_rps)} rps из требуемых ${rps(d.required_rps)} rps — нехватка ${d.shortfall_pct}%.${d.bottleneck_name ? ` Ограничивает «${d.bottleneck_name}».` : ""}`,
          action: d.bottleneck_name
            ? `Начните с «${d.bottleneck_name}» — расширяйте именно его, остальные изменения не поднимут потолок.`
            : "Найдите компонент с наибольшей загрузкой и расширяйте его.",
          impact: "Пропускная способность системы равна пропускной способности самого узкого места на пути.",
        }
      : {
          title: "Throughput requirement isn't met",
          detail: `Serving ${rps(d.served_rps)} rps against a required ${rps(d.required_rps)} rps — ${d.shortfall_pct}% short.${d.bottleneck_name ? ` "${d.bottleneck_name}" is the constraint.` : ""}`,
          action: d.bottleneck_name
            ? `Start with "${d.bottleneck_name}" — widening anything else won't raise the ceiling.`
            : "Find the most heavily utilized component and widen it.",
          impact: "A path's throughput is capped by its narrowest component, so only the bottleneck moves the number.",
        },

  availability_below_target: (d, lang) =>
    lang === "ru"
      ? {
          title: "Доступность ниже целевой",
          detail: `Расчётная составная доступность ${d.measured_pct}% против целевых ${d.target_pct}%.${d.weakest_name ? ` Слабое звено — «${d.weakest_name}».` : ""}`,
          action: `Добавьте реплики${d.weakest_name ? ` для «${d.weakest_name}»` : ""}: доступность цепочки перемножается, поэтому один нерезервированный узел определяет весь результат.`,
          impact: "Резервирование слабого звена даёт наибольший прирост общей доступности.",
        }
      : {
          title: "Availability is below target",
          detail: `Estimated composite availability is ${d.measured_pct}% against a ${d.target_pct}% target.${d.weakest_name ? ` "${d.weakest_name}" is the weakest link.` : ""}`,
          action: `Add replicas${d.weakest_name ? ` to "${d.weakest_name}"` : ""} — availability multiplies along a chain, so one unreplicated node caps the whole result.`,
          impact: "Replicating the weakest link buys the largest gain in composite availability.",
        },

  overprovisioned: (d, lang) =>
    lang === "ru"
      ? {
          title: `«${d.name}» простаивает`,
          detail: `${d.replicas} реплик(и) при загрузке ${d.utilization_pct}% (${rps(d.offered)} rps).`,
          action: `Уменьшите число реплик «${d.name}», если такой запас не нужен под пиковые нагрузки.`,
          impact: "Экономия ресурсов без влияния на текущий профиль трафика.",
        }
      : {
          title: `"${d.name}" is sitting idle`,
          detail: `${d.replicas} replicas at ${d.utilization_pct}% utilization (${rps(d.offered)} rps).`,
          action: `Reduce the replica count on "${d.name}" unless that headroom is there for peak load.`,
          impact: "Frees up capacity without affecting the current traffic profile.",
        },
};

export function recommendationText(
  recommendation: Recommendation,
  language: Language
): RecommendationText {
  const builder = BUILDERS[recommendation.rule_id];
  if (!builder) {
    return { title: recommendation.rule_id, detail: "", action: "" };
  }
  try {
    return builder(recommendation.details ?? {}, language);
  } catch {
    return { title: recommendation.rule_id, detail: "", action: "" };
  }
}

export type { Builder };
