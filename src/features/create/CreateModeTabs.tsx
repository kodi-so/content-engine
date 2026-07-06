import { FileText, Image, Music, Video } from "lucide-react";
import { CREATE_MODE_DEFINITIONS, type CreateMode } from "../../lib/create/createModes";

const createModeIcons: Record<CreateMode, typeof Image> = {
  image: Image,
  video: Video,
  audio: Music,
  slideshow: FileText,
};

export function CreateModeTabs({
  mode,
  onModeChange,
}: {
  mode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[var(--space-2)]">
      {CREATE_MODE_DEFINITIONS.map((definition) => {
        const Icon = createModeIcons[definition.id];
        const selected = definition.id === mode;
        return (
          <button
            className={selected ? "primary-button" : "secondary-button"}
            key={definition.id}
            onClick={() => onModeChange(definition.id)}
            type="button"
          >
            <Icon size={16} />
            {definition.label}
          </button>
        );
      })}
    </div>
  );
}
