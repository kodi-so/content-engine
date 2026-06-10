import {
  CustomSelect,
  type CustomSelectOption,
  type CustomSelectProps,
} from "../CustomSelect";

export type WorkflowSelectOption = CustomSelectOption;
export type WorkflowSelectProps = CustomSelectProps;

export function WorkflowSelect(props: WorkflowSelectProps) {
  return <CustomSelect {...props} searchPlaceholder="Search models" />;
}
