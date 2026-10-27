'use client';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function ConfirmationDialog({title,description,confirmLabel='تأیید',onConfirm,onCancel,danger=false,children}:{children?:React.ReactNode;title:string;description:string;confirmLabel?:string;onConfirm:()=>void;onCancel:()=>void;danger?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
  useEffect(()=>{const dialog=ref.current;const previous=document.activeElement as HTMLElement|null;dialog?.showModal();return ()=>{dialog?.close();if(previous?.isConnected)previous.focus();};},[]);
  return <dialog ref={ref} className="confirmation-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();onCancel();}}>
    <div className="section-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="بستن" onClick={onCancel}><X size={19}/></button></div>
    <p id={descriptionId} className="muted">{description}</p>{children}<div className="form-actions"><button type="button" className={danger?'danger-button':'primary'} onClick={onConfirm}>{confirmLabel}</button><button type="button" autoFocus onClick={onCancel}>انصراف</button></div>
  </dialog>;
}
