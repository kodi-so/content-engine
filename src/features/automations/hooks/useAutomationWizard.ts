import { useState, useCallback } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

export type WizardStep = "account" | "content" | "schedule" | "preview";

export interface WizardData {
  // Step 1: Account
  name: string;
  accountId: Id<"accounts"> | null;
  contentType: "slideshow";

  // Step 2: Content Setup (merged theme + format)
  themeConfig: {
    accountNiche: string;
    topicExamples: string[];
  };
  formatConfig: {
    visualStyle?: string;
    aspectRatio: "1:1" | "4:5" | "9:16";
    contentStyle?: "overlay" | "infographic";
  };

  // Step 3: Schedule
  scheduleConfig: {
    timezone: string;
    postingTimes: Array<{ dayOfWeek: number; hour: number; minute: number }>;
  };
  postSettings: {
    privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
    autoAddMusic: boolean;
  };
}

const defaultWizardData: WizardData = {
  name: "",
  accountId: null,
  contentType: "slideshow",
  themeConfig: {
    accountNiche: "",
    topicExamples: [],
  },
  formatConfig: {
    visualStyle: "dark minimalist",
    aspectRatio: "4:5",
  },
  scheduleConfig: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    postingTimes: [],
  },
  postSettings: {
    privacyLevel: "PUBLIC_TO_EVERYONE",
    autoAddMusic: true,
  },
};

const STEPS: WizardStep[] = ["account", "content", "schedule", "preview"];

export interface UseAutomationWizardOptions {
  initialData?: Partial<WizardData>;
  editMode?: boolean;
  automationId?: Id<"automations">;
}

export function useAutomationWizard(options: UseAutomationWizardOptions = {}) {
  const { initialData, editMode = false, automationId } = options;

  const [currentStep, setCurrentStep] = useState<WizardStep>("account");
  const isEditing = editMode && !!automationId;
  const [data, setData] = useState<WizardData>(() => {
    if (initialData) {
      return { ...defaultWizardData, ...initialData };
    }
    return defaultWizardData;
  });
  const [previewContentId, setPreviewContentId] = useState<Id<"content"> | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const currentStepIndex = STEPS.indexOf(currentStep);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex]);

  const updateData = useCallback(<K extends keyof WizardData>(
    key: K,
    value: WizardData[K]
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateThemeConfig = useCallback(<K extends keyof WizardData["themeConfig"]>(
    key: K,
    value: WizardData["themeConfig"][K]
  ) => {
    setData((prev) => ({
      ...prev,
      themeConfig: { ...prev.themeConfig, [key]: value },
    }));
  }, []);

  const updateFormatConfig = useCallback(<K extends keyof WizardData["formatConfig"]>(
    key: K,
    value: WizardData["formatConfig"][K]
  ) => {
    setData((prev) => ({
      ...prev,
      formatConfig: { ...prev.formatConfig, [key]: value },
    }));
  }, []);

  const updateScheduleConfig = useCallback(<K extends keyof WizardData["scheduleConfig"]>(
    key: K,
    value: WizardData["scheduleConfig"][K]
  ) => {
    setData((prev) => ({
      ...prev,
      scheduleConfig: { ...prev.scheduleConfig, [key]: value },
    }));
  }, []);

  const updatePostSettings = useCallback(<K extends keyof WizardData["postSettings"]>(
    key: K,
    value: WizardData["postSettings"][K]
  ) => {
    setData((prev) => ({
      ...prev,
      postSettings: { ...prev.postSettings, [key]: value },
    }));
  }, []);

  const reset = useCallback(() => {
    setData(defaultWizardData);
    setCurrentStep("account");
    setPreviewContentId(null);
    setIsGeneratingPreview(false);
  }, []);

  // Validation for each step
  const validateStep = useCallback((step: WizardStep): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (step) {
      case "account":
        if (!data.name.trim()) errors.push("Automation name is required");
        if (!data.accountId) errors.push("Please select a TikTok account");
        break;

      case "content":
        if (!data.themeConfig.accountNiche.trim()) errors.push("Account niche is required");
        if (data.themeConfig.topicExamples.length < 3) errors.push("Add at least 3 topic examples");
        break;

      case "schedule":
        if (data.scheduleConfig.postingTimes.length === 0) {
          errors.push("Add at least one posting time");
        }
        break;

      case "preview":
        // Preview step doesn't require validation
        break;
    }

    return { valid: errors.length === 0, errors };
  }, [data]);

  const canProceed = useCallback(() => {
    return validateStep(currentStep).valid;
  }, [currentStep, validateStep]);

  return {
    currentStep,
    currentStepIndex,
    totalSteps: STEPS.length,
    data,
    previewContentId,
    isGeneratingPreview,
    isEditing,
    automationId,
    setPreviewContentId,
    setIsGeneratingPreview,
    goToStep,
    goNext,
    goBack,
    updateData,
    updateThemeConfig,
    updateFormatConfig,
    updateScheduleConfig,
    updatePostSettings,
    validateStep,
    canProceed,
    reset,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === STEPS.length - 1,
  };
}

export type UseAutomationWizardReturn = ReturnType<typeof useAutomationWizard>;
