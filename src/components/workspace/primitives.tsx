import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';

export function PageHeader({eyebrow,title,description,action}:{eyebrow?:string;title:string;description?:string;action?:ReactNode}) {
  return <div className="page-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{action&&<div className="page-actions">{action}</div>}</div>;
}
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'error'}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
export function EmptyState({icon:Icon,title,description,action}:{icon:LucideIcon;title:string;description:string;action?:ReactNode}) {
  return <div className="empty"><span className="empty-icon"><Icon size={24} aria-hidden="true"/></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function FormSection({title,description,children,className='',action}:{title:string;description?:string;children:ReactNode;className?:string;action?:ReactNode}) {
  return <section className={`panel form-section ${className}`}><div className="section-heading"><div><h2>{title}</h2>{description&&<p className="muted">{description}</p>}</div>{action}</div>{children}</section>;
}
export function SavingLabel({busy,label='ذخیره تغییرات',pending='در حال ذخیره…'}:{busy:boolean;label?:string;pending?:string}) {
  return <>{busy&&<LoaderCircle size={17} className="spin" aria-hidden="true"/>}{busy?pending:label}</>;
}
