import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, {act} from 'react';
import { UIContext, navigation } from './ui-harness.mjs';
import { defaultSettings } from '../src/features/settings/schema.ts';
const dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>',{url:'http://localhost/settings'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','Element','Event','MouseEvent','location'])globalThis[name]=dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const {createRoot}=await import('react-dom/client');
const {SettingsForm}=await import('../src/components/settings-form.tsx');
const root=createRoot(document.getElementById('root'));
let context;
async function render(){await act(async()=>root.render(React.createElement(UIContext.Provider,{value:context},React.createElement(SettingsForm))));}
async function click(node){assert.ok(node,'expected control exists');await act(async()=>node.click());}
function button(text){return [...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);}
function input(label){return [...document.querySelectorAll('label')].find(node=>node.textContent.startsWith(label))?.querySelector('input');}
async function type(node,value){assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
function fresh(overrides={}){return {...structuredClone(defaultSettings),...overrides};}
async function reset(settings=fresh()){
  await act(async()=>root.render(null));
  context={settings,keys:{faraz:true},busy:false,error:'',saveSettings:async()=>false};
  await render();
}
async function section(id){await click([...document.querySelectorAll('.settings-navigation button')].find(n=>n.textContent.includes(id)));}

test('settings keeps one draft across sections and only reports a confirmed save',async()=>{
  await reset();
  await type(input('نام کلینیک'),'کلینیک ویرایش شده');
  await section('نوع‌های حیوان');
  await type(input('نوع حیوان جدید'),'خرگوش');await click(button('افزودن به فهرست'));
  await section('مشخصات کلینیک');
  assert.equal(input('نام کلینیک').value,'کلینیک ویرایش شده');
  let payload;
  context={...context,saveSettings:async(settings,key)=>{payload={settings,key};return false;}};await render();
  await submit();assert.equal(payload.settings.clinicName,'کلینیک ویرایش شده');assert.deepEqual(payload.settings.customSpecies,['خرگوش']);assert.equal(payload.key,'');
  assert.ok(document.querySelector('.save-status').textContent.includes('ذخیره‌نشده'));
  context={...context,saveSettings:async settings=>{context={...context,settings:structuredClone(settings)};await render();return true;}};await render();await submit();
  assert.ok(document.querySelector('.save-status').textContent.includes('تنظیمات ذخیره شد'));
});

test('incoming settings do not overwrite a dirty draft; explicit reload discards it',async()=>{
  await reset();await type(input('نام کلینیک'),'ویرایش محلی');
  context={...context,settings:fresh({clinicName:'نسخه سرور'})};await render();
  assert.equal(input('نام کلینیک').value,'ویرایش محلی');assert.equal(button('ذخیره همه تغییرات').disabled,true);
  await click(button('بارگذاری تنظیمات جدید'));await click(button('بارگذاری نسخه جدید'));
  assert.equal(input('نام کلینیک').value,'نسخه سرور');assert.equal(document.querySelector('dialog'),null);
});

test('unsaved navigation and logout require explicit confirmation',async()=>{
  await reset();await type(input('نام کلینیک'),'ویرایش محلی');
  const anchor=document.createElement('a');anchor.href='/patients';document.body.append(anchor);
  await click(anchor);assert.ok(document.querySelector('dialog[open]'));assert.equal(navigation.length,0);
  await click(button('انصراف'));assert.equal(navigation.length,0);
  await act(async()=>window.dispatchEvent(new Event('vetly:before-logout',{cancelable:true})));
  await click(button('خروج بدون ذخیره'));assert.equal(navigation.at(-1),'logout');anchor.remove();
});

test('live SMS requires explicit confirmation, contains no credential, and never retries failures',async()=>{
  const settings=fresh({smsProvider:'faraz',smsEnabled:true,clinicPhone:'02112345678'});
  for(const key of ['registrationPattern','vaccinePattern','taskPattern'])settings[key].code='Approved123';
  await reset(settings);await section('سرویس پیامک');await type(input('شماره موبایل خودتان'),'09123456789');
  const requests=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});throw new Error('simulated timeout');};
  try {
    await click(button('ارسال پیامک آزمایشی'));assert.equal(requests.length,0);assert.ok(document.querySelector('dialog[open]'));
    await click(button('تأیید و ارسال'));assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/settings/sms-test');assert.deepEqual(Object.keys(requests[0].body).sort(),['pattern','recipient','requestId','values']);
    assert.ok(document.querySelector('.test-result').textContent.includes('نامشخص'));await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));assert.equal(requests.length,1);
    await section('مشخصات کلینیک');await type(input('نام کلینیک'),'ویرایش جدید');await section('سرویس پیامک');assert.equal(button('ارسال پیامک آزمایشی').disabled,true);
  } finally {globalThis.fetch=originalFetch;}
});

test('template names retain case and deletion requires confirmation; RTL tabs support keys',async()=>{
  await reset();await section('قالب‌های پیامک');
  let fields=[...document.querySelectorAll('.parameter-row input')];
  await type(fields[0],'clinic');
  await click(document.querySelector('[aria-label="حذف پارامتر clinic"]'));
  assert.equal(document.querySelectorAll('.parameter-row').length,3);
  await click(button('انصراف'));assert.equal(document.querySelectorAll('.parameter-row').length,3);
  await click(document.querySelector('[aria-label="حذف پارامتر clinic"]'));await click(button('حذف از پیش‌نویس'));
  assert.equal(document.querySelectorAll('.parameter-row').length,2);
  const tab=document.querySelector('[role="tab"][aria-selected="true"]');
  await act(async()=>tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
  assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent,'واکسیناسیون');
  await click(document.querySelector('[role="tab"]'));
  assert.equal(document.querySelector('.parameter-row input').value,'PET');
});

test('unsubmitted animal text survives section switches and invalid data does not save',async()=>{
  await reset();await section('نوع‌های حیوان');await type(input('نوع حیوان جدید'),'خرگوش');
  await section('مشخصات کلینیک');await section('نوع‌های حیوان');assert.equal(input('نوع حیوان جدید').value,'خرگوش');
  await section('مشخصات کلینیک');await type(input('نام کلینیک'),'');let calls=0;
  context={...context,saveSettings:async()=>{calls++;return true;}};await render();await submit();assert.equal(calls,0);assert.ok(document.querySelector('[role="alert"]'));
});

test.after(async()=>{await act(async()=>root.unmount());dom.window.close();});
