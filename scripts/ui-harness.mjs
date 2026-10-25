import React from 'react';
export const UIContext=React.createContext(null);
export const navigation=[];
export function useClinic(){return React.useContext(UIContext);}
export function useRouter(){return {push:path=>navigation.push(path)};}
export function usePathname(){return '/settings';}
export async function logout(){navigation.push('logout');}
export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children);}
