import { useState, useCallback } from "react";
import type { ModalButton } from "@/components/GameModal";

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  buttons: ModalButton[];
};

const EMPTY: ModalState = { visible: false, title: "", message: "", buttons: [] };

export function useGameModal() {
  const [modal, setModal] = useState<ModalState>(EMPTY);

  const showModal = useCallback(
    (title: string, message: string, buttons: ModalButton[]) => {
      setModal({ visible: true, title, message, buttons });
    },
    []
  );

  const hideModal = useCallback(() => {
    setModal(EMPTY);
  }, []);

  return { modal, showModal, hideModal };
}
