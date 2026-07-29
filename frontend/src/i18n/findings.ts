import type { Finding } from "../types";
import type { Language } from "./language";
import { CATALOG_I18N } from "./catalogI18n";

function typeLabel(typeKey: string, language: Language): string {
  return CATALOG_I18N[typeKey]?.[language]?.label ?? typeKey;
}

function sequenceLabel(sequence: string[], language: Language): string {
  const arrow = language === "ru" ? " → " : " -> ";
  return sequence.map((t) => typeLabel(t, language)).join(arrow);
}

type Builder = (details: Record<string, unknown>, language: Language) => string;

const BUILDERS: Record<string, Builder> = {
  spof: (d, lang) => {
    const name = String(d.name);
    return lang === "ru"
      ? `«${name}» не имеет резервирования (реплик=1). Единственный отказ выведет его из строя.`
      : `'${name}' has no redundancy (replicas=1). A single failure takes it down.`;
  },
  missing_load_balancer: (d, lang) => {
    const count = Number(d.count);
    const label = typeLabel(String(d.type), lang);
    return lang === "ru"
      ? `${count} экземпляров «${label}» используют общий источник трафика, но не защищены балансировщиком нагрузки.`
      : `${count} instances of '${label}' share the same upstream but aren't fronted by a load balancer.`;
  },
  direct_client_to_db: (d, lang) => {
    const name = String(d.name);
    return lang === "ru"
      ? `Клиент подключается напрямую к «${name}»; добавьте промежуточный слой приложения.`
      : `Client connects directly to '${name}'; add an application layer in between.`;
  },
  db_without_cache: (d, lang) => {
    const name = String(d.name);
    return lang === "ru"
      ? `У «${name}» нет кэша выше по потоку. Рассмотрите добавление кэша для снижения нагрузки на чтение.`
      : `'${name}' has no cache upstream. Consider adding one to reduce read load.`;
  },
  no_async_decoupling: (d, lang) => {
    const target = Number(d.target);
    const name = String(d.name);
    const cap = Number(d.cap);
    return lang === "ru"
      ? `Целевая пропускная способность (${target} rps) значительно выше ёмкости «${name}» (${cap} rps), а очередь для буферизации записи отсутствует; рассмотрите асинхронную обработку.`
      : `Target throughput (${target} rps) is well above '${name}' capacity (${cap} rps) with no queue buffering writes; consider async processing.`;
  },
  latency_budget_exceeded: (d, lang) => {
    const path = (d.path as string[]) ?? [];
    const arrow = lang === "ru" ? " → " : " -> ";
    const names = path.join(arrow);
    const total = Number(d.total);
    const budget = Number(d.budget);
    return lang === "ru"
      ? `Путь ${names} даёт суммарно ${total} мс, превышая бюджет в ${budget} мс.`
      : `Path ${names} totals ${total}ms, exceeding the ${budget}ms budget.`;
  },
  throughput_bottleneck: (d, lang) => {
    const name = String(d.name);
    const cap = Number(d.cap);
    const target = Number(d.target);
    return lang === "ru"
      ? `«${name}» ограничивает этот путь до ${cap} rps, что ниже требуемых ${target} rps.`
      : `'${name}' caps this path at ${cap} rps, below the required ${target} rps.`;
  },
  availability_below_target: (d, lang) => {
    const pct = Number(d.pct);
    const target = Number(d.target);
    return lang === "ru"
      ? `Расчётная составная доступность вдоль критического пути — ${pct.toFixed(3)}%, ниже целевых ${target}%.`
      : `Estimated composite availability along the critical path is ${pct.toFixed(3)}%, below the ${target}% target.`;
  },
  functional_path_ok: (d, lang) => {
    const description = d.description ? String(d.description) : sequenceLabel((d.sequence as string[]) ?? [], lang);
    return lang === "ru"
      ? `Требование «${description}» выполнено.`
      : `Requirement '${description}' is satisfied.`;
  },
  functional_path_missing: (d, lang) => {
    const sequence = (d.sequence as string[]) ?? [];
    const description = d.description ? String(d.description) : sequenceLabel(sequence, lang);
    const seqLabel = sequenceLabel(sequence, lang);
    return lang === "ru"
      ? `Требование «${description}» не выполнено: путь, соответствующий ${seqLabel}, не найден.`
      : `Requirement '${description}' is not satisfied: no path matching ${seqLabel} was found.`;
  },
};

export function findingMessage(finding: Finding, language: Language): string {
  const builder = BUILDERS[finding.rule_id];
  if (!builder) return finding.message;
  try {
    return builder(finding.details ?? {}, language);
  } catch {
    return finding.message;
  }
}
