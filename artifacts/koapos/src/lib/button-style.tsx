import { createContext, useContext, useMemo } from "react";
import { useGetPosSettings } from "@workspace/api-client-react";

type ButtonStyle = "icon" | "icon_text" | "text";

interface ButtonStyleContextValue {
  style: ButtonStyle;
  showIcon: boolean;
  showText: boolean;
}

const ButtonStyleContext = createContext<ButtonStyleContextValue>({
  style: "icon_text",
  showIcon: true,
  showText: true,
});

export function ButtonStyleProvider({ children }: { children: React.ReactNode }) {
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const style = ((posSettings?.buttonStyle as ButtonStyle | undefined) ?? "icon_text");

  const value = useMemo<ButtonStyleContextValue>(
    () => ({ style, showIcon: style !== "text", showText: style !== "icon" }),
    [style],
  );

  return <ButtonStyleContext.Provider value={value}>{children}</ButtonStyleContext.Provider>;
}

export function useButtonStyle(): ButtonStyleContextValue {
  return useContext(ButtonStyleContext);
}
