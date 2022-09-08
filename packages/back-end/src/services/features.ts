import { FeatureDefinitionRule, FeatureDefinition } from "../../types/api";
import {
  FeatureDraftChanges,
  FeatureEnvironment,
  FeatureInterface,
  FeatureValueType,
} from "../../types/feature";
import { queueWebhook } from "../jobs/webhooks";
import {
  createFeature,
  getAllFeatures,
  updateFeature,
} from "../models/FeatureModel";
import uniqid from "uniqid";
import isEqual from "lodash/isEqual";
import { findProjectById } from "../models/ProjectModel";

function roundVariationWeight(num: number): number {
  return Math.round(num * 1000) / 1000;
}

// eslint-disable-next-line
function getJSONValue(type: FeatureValueType, value: string): any {
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  if (type === "number") return parseFloat(value) || 0;
  if (type === "string") return value;
  if (type === "boolean") return value === "false" ? false : true;
  return null;
}
export async function getFeatureDefinitions(
  organization: string,
  environment: string = "production",
  project?: string
) {
  const features = await getAllFeatures(organization, project);

  const defs: Record<string, FeatureDefinition> = {};
  features.forEach((feature) => {
    const settings = feature.environmentSettings?.[environment];

    // Don't include features which are disabled for this environment
    if (!settings || !settings.enabled || feature.archived) {
      return;
    }

    defs[feature.id] = {
      defaultValue: getJSONValue(feature.valueType, feature.defaultValue),
      rules:
        settings.rules
          ?.filter((r) => r.enabled)
          ?.map((r) => {
            const rule: FeatureDefinitionRule = {};
            if (r.condition && r.condition !== "{}") {
              try {
                rule.condition = JSON.parse(r.condition);
              } catch (e) {
                // ignore condition parse errors here
              }
            }

            if (r.type === "force") {
              rule.force = getJSONValue(feature.valueType, r.value);
            } else if (r.type === "experiment") {
              rule.variations = r.values.map((v) =>
                getJSONValue(feature.valueType, v.value)
              );

              rule.coverage = r.coverage;

              rule.weights = r.values
                .map((v) => v.weight)
                .map((w) => (w < 0 ? 0 : w > 1 ? 1 : w))
                .map((w) => roundVariationWeight(w));

              if (r.trackingKey) {
                rule.key = r.trackingKey;
              }
              if (r.hashAttribute) {
                rule.hashAttribute = r.hashAttribute;
              }
              if (r?.namespace && r.namespace.enabled && r.namespace.name) {
                rule.namespace = [
                  r.namespace.name,
                  // eslint-disable-next-line
                  parseFloat(r.namespace.range[0] as any) || 0,
                  // eslint-disable-next-line
                  parseFloat(r.namespace.range[1] as any) || 0,
                ];
              }
            } else if (r.type === "rollout") {
              rule.force = getJSONValue(feature.valueType, r.value);
              rule.coverage =
                r.coverage > 1 ? 1 : r.coverage < 0 ? 0 : r.coverage;

              if (r.hashAttribute) {
                rule.hashAttribute = r.hashAttribute;
              }
            }
            return rule;
          }) ?? [],
    };
    if (defs[feature.id].rules && !defs[feature.id].rules?.length) {
      delete defs[feature.id].rules;
    }
  });

  return defs;
}

export function getEnabledEnvironments(feature: FeatureInterface) {
  return Object.keys(feature.environmentSettings ?? {}).filter((env) => {
    return !!feature.environmentSettings?.[env]?.enabled;
  });
}

export function generateRuleId() {
  return uniqid("fr_");
}

export function addIdsToRules(
  environmentSettings: Record<string, FeatureEnvironment> = {},
  featureId: string
) {
  Object.values(environmentSettings).forEach((env) => {
    if (env.rules && env.rules.length) {
      env.rules.forEach((r) => {
        if (r.type === "experiment" && !r?.trackingKey) {
          r.trackingKey = featureId;
        }
        if (!r.id) {
          r.id = generateRuleId();
        }
      });
    }
  });
}

export async function featureUpdated(
  feature: FeatureInterface,
  previousEnvironments: string[] = [],
  previousProject: string = ""
) {
  const currentEnvironments = getEnabledEnvironments(feature);

  // fire the webhook:
  await queueWebhook(
    feature.organization,
    [...currentEnvironments, ...previousEnvironments],
    [previousProject || "", feature.project || ""],
    true
  );
}

// eslint-disable-next-line
export function arrayMove(array: Array<any>, from: number, to: number) {
  const newArray = array.slice();
  newArray.splice(
    to < 0 ? newArray.length + to : to,
    0,
    newArray.splice(from, 1)[0]
  );
  return newArray;
}

export function verifyDraftsAreEqual(
  actual?: FeatureDraftChanges,
  expected?: FeatureDraftChanges
) {
  if (
    !isEqual(
      {
        defaultValue: actual?.defaultValue,
        rules: actual?.rules,
      },
      {
        defaultValue: expected?.defaultValue,
        rules: expected?.rules,
      }
    )
  ) {
    throw new Error(
      "New changes have been made to this feature. Please review and try again."
    );
  }
}

function parseDefaultValue(
  defaultValue: string,
  valueType: FeatureValueType
): string {
  if (valueType === "boolean") {
    return defaultValue === "true" ? "true" : "false";
  }
  if (valueType === "number") {
    return parseFloat(defaultValue) + "";
  }
  if (valueType === "string") {
    return defaultValue;
  }
  try {
    return JSON.stringify(JSON.parse(defaultValue), null, 2);
  } catch (e) {
    throw new Error(`JSON parse error for default value`);
  }
}

export async function createFeatureService(feature: Partial<FeatureInterface>) {
  const {
    id,
    archived,
    description,
    organization,
    owner,
    project,
    valueType,
    defaultValue,
    tags,
    environmentSettings,
    draft,
    revision,
  } = feature;

  if (!id) throw new Error("Must specify feature key");
  if (!id.match(/^[a-zA-Z0-9_.:|-]+$/)) {
    throw new Error(
      "Feature keys can only include letters, numbers, hyphens, and underscores."
    );
  }

  if (!organization) throw new Error("Organization could not be found");

  if (!owner) throw new Error("Owner must be specified");

  if (!valueType) throw new Error("Value type must be specified");
  if (!["boolean", "number", "string", "json"].includes(valueType)) {
    throw new Error(
      "Value type must be one of boolean, number, string, or json"
    );
  }

  if (!defaultValue) throw new Error("Default value must be specified");

  const resultFeature: FeatureInterface = {
    id: id.toLowerCase(),
    archived: archived ?? false,
    description,
    organization,
    owner,
    project,
    dateCreated: new Date(),
    dateUpdated: new Date(),
    valueType: valueType,
    defaultValue: parseDefaultValue(defaultValue, valueType),
    tags,
    environmentSettings,
    draft,
    revision,
  };

  addIdsToRules(resultFeature.environmentSettings, resultFeature.id);

  await createFeature(resultFeature);
  featureUpdated(resultFeature);

  return resultFeature;
}

export async function updateFeatureService(
  updates: Partial<FeatureInterface>,
  feature: FeatureInterface,
  featureId: string
) {
  const allowedKeys: (keyof FeatureInterface)[] = [
    "tags",
    "description",
    "project",
    "owner",
  ];

  const invalidKeys = Object.keys(updates).filter(
    (k: keyof FeatureInterface) => !allowedKeys.includes(k)
  );
  if (invalidKeys.length) {
    throw new Error(
      `Invalid update fields for feature: [${invalidKeys.join(", ")}]`
    );
  }

  let requiresWebhook = false;
  if (updates.project) {
    if (!(await findProjectById(updates.project, feature.organization))) {
      throw new Error("Project not found");
    }

    // See if anything important changed that requires firing a webhook
    if ("project" in updates && updates.project !== feature.project) {
      requiresWebhook = true;
    }
  }

  await updateFeature(feature.organization, featureId, {
    ...updates,
    dateUpdated: new Date(),
  });

  const newFeature = { ...feature, ...updates };

  if (requiresWebhook) {
    featureUpdated(
      newFeature,
      getEnabledEnvironments(feature),
      feature.project || ""
    );
  }

  return newFeature;
}
