"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Save, Plus, X, Star, Pencil, Trash2 } from "lucide-react";
import { defaultSettings } from "../lib/app-data";
import { articleDomains, domainConfigs, type ArticleDomain } from "../lib/content-domains";
import { useAppStore } from "../providers/app-store";

type WechatAccountView = {
  id: string;
  name: string;
  appId: string;
  appIdMasked: string;
  hasAppSecret: boolean;
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

type WechatAccountForm = {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
  defaultAuthor: string;
  contentSourceUrl: string;
  setAsSelected: boolean;
};

const emptyWechatAccountForm: WechatAccountForm = {
  id: "",
  name: "",
  appId: "",
  appSecret: "",
  defaultAuthor: "",
  contentSourceUrl: "",
  setAsSelected: true,
};

export function Settings() {
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState(settings);
  const [notice, setNotice] = useState("");
  const [wechatAccounts, setWechatAccounts] = useState<WechatAccountView[]>([]);
  const [selectedWechatAccountId, setSelectedWechatAccountId] = useState<string | null>(null);
  const [wechatForm, setWechatForm] = useState<WechatAccountForm>(emptyWechatAccountForm);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatLoaded, setWechatLoaded] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    void loadWechatAccounts();
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(form);
    setNotice("已保存到云端");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleRestoreDefaults = () => {
    setForm(defaultSettings);
    saveSettings(defaultSettings);
    setNotice("已恢复并保存默认设置");
    window.setTimeout(() => setNotice(""), 2000);
  };

  async function loadWechatAccounts() {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload) {
        setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
        setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
        setWechatLoaded(true);
        return;
      }

      throw new Error(payload?.message ?? "加载公众号账号失败");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  }

  const handleWechatFormChange = <K extends keyof WechatAccountForm>(key: K, value: WechatAccountForm[K]) => {
    setWechatForm((current) => ({ ...current, [key]: value }));
  };

  const handleEditWechatAccount = (account: WechatAccountView) => {
    setWechatForm({
      id: account.id,
      name: account.name,
      appId: account.appId,
      appSecret: "",
      defaultAuthor: account.defaultAuthor,
      contentSourceUrl: account.contentSourceUrl,
      setAsSelected: selectedWechatAccountId === account.id,
    });
  };

  const resetWechatForm = () => {
    setWechatForm({
      ...emptyWechatAccountForm,
      setAsSelected: wechatAccounts.length === 0,
    });
  };

  const handleSaveWechatAccount = async () => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "upsert",
          account: wechatForm,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "保存公众号账号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      resetWechatForm();
      setNotice("公众号账号已保存");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleDeleteWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "删除公众号账号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      if (wechatForm.id === id) {
        resetWechatForm();
      }
      setNotice("公众号账号已删除");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleSelectWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "select",
          selectedAccountId: id,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "切换默认公众号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      setWechatForm((current) => ({ ...current, setAsSelected: current.id ? current.id === id : true }));
      setNotice("默认公众号已更新");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换默认公众号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleVerifyWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify",
          accountId: id,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "公众号连接测试失败");
      }

      setNotice(`连接测试通过${payload.accountName ? ` · ${payload.accountName}` : ""}`);
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "公众号连接测试失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setWechatLoading(false);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>账号设置</h1>
          <p className="text-[13px] text-gray-500 mt-1">配置账号人设、可覆盖领域、写作风格和默认排版偏好，AI 会在生成每篇文章时综合参考</p>
        </div>
        <div className="flex items-center gap-3">
          {notice ? <span className="text-[12px] text-green-600">{notice}</span> : null}
          <button
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 border border-gray-200 px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50"
            style={{ fontWeight: 500 }}
          >
            <RotateCcw className="w-4 h-4" /> 恢复默认
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-[13px] hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <Save className="w-4 h-4" /> 保存设置
          </button>
        </div>
      </div>

      <Section title="账号定位">
        <Field label="账号名称" value={form.accountName} onChange={(value) => updateField("accountName", value)} />
        <Field label="账号定位" value={form.accountPosition} onChange={(value) => updateField("accountPosition", value)} />
        <DomainSelector label="账号可覆盖领域" values={form.contentAreas} onChange={(values) => updateField("contentAreas", values)} />
      </Section>

      <Section title="目标读者画像">
        <Field label="年龄范围" value={form.readerAgeRange} onChange={(value) => updateField("readerAgeRange", value)} />
        <Field label="职业特征" value={form.readerJobTraits} onChange={(value) => updateField("readerJobTraits", value)} />
        <Field label="核心需求" value={form.readerNeeds} onChange={(value) => updateField("readerNeeds", value)} />
      </Section>

      <Section title="品牌语气关键词">
        <TagEditor label="语气风格标签" values={form.toneKeywords} color="green" onChange={(values) => updateField("toneKeywords", values)} />
      </Section>

      <Section title="禁写领域 / 敏感词">
        <TagEditor label="禁止涉及的话题或词汇" values={form.bannedTopics} color="red" onChange={(values) => updateField("bannedTopics", values)} />
      </Section>

      <Section title="常用 CTA 文案">
        <Field label="关注引导" value={form.ctaFollow} onChange={(value) => updateField("ctaFollow", value)} />
        <Field label="互动引导" value={form.ctaEngage} onChange={(value) => updateField("ctaEngage", value)} />
        <Field label="转发引导" value={form.ctaShare} onChange={(value) => updateField("ctaShare", value)} />
      </Section>

      <Section title="默认排版模板">
        <div>
          <label className="text-[12px] text-gray-500 mb-1.5 block">首选模板</label>
          <div className="grid grid-cols-4 gap-2">
            {["极简白", "科技蓝", "商务灰", "暖色调"].map((template) => (
              <button
                key={template}
                onClick={() => updateField("defaultTemplate", template)}
                className={`p-3 rounded-lg border text-[12px] text-center transition-colors ${
                  form.defaultTemplate === template ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
                style={{ fontWeight: 500 }}
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="公众号接入">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-800">
          AppSecret 只会走服务端保存，不会进入浏览器本地草稿和普通设置同步里。
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>已配置公众号</div>
              <button
                type="button"
                onClick={resetWechatForm}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                新增账号
              </button>
            </div>

            {!wechatAccounts.length && wechatLoaded ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-[13px] text-gray-500">
                还没有配置公众号账号。添加后就可以在排版页选择并推送到对应草稿箱。
              </div>
            ) : null}

            <div className="space-y-3">
              {wechatAccounts.map((account) => {
                const isSelected = selectedWechatAccountId === account.id;

                return (
                  <div key={account.id} className={`rounded-xl border px-4 py-3 ${isSelected ? "border-emerald-200 bg-emerald-50/70" : "border-gray-200 bg-white"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>{account.name}</span>
                          {isSelected ? (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">默认</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[12px] text-gray-500">AppID：{account.appIdMasked}</div>
                        <div className="mt-1 text-[12px] text-gray-500">
                          Author：{account.defaultAuthor || "未设置"} · Secret：{account.hasAppSecret ? "已配置" : "未配置"}
                        </div>
                      </div>
                      <div className="flex flex-nowrap items-center gap-2 lg:max-w-[46%] lg:justify-end">
                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => void handleSelectWechatAccount(account.id)}
                            aria-label="设为默认"
                            title="设为默认"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleEditWechatAccount(account)}
                          aria-label="编辑"
                          title="编辑"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteWechatAccount(account.id)}
                          aria-label="删除"
                          title="删除"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
            <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>
              {wechatForm.id ? "编辑公众号账号" : "新增公众号账号"}
            </div>
            <Field label="账号名称" value={wechatForm.name} onChange={(value) => handleWechatFormChange("name", value)} />
            <Field label="AppID" value={wechatForm.appId} onChange={(value) => handleWechatFormChange("appId", value)} />
            <Field
              label={wechatForm.id ? "AppSecret（留空则保持不变）" : "AppSecret"}
              value={wechatForm.appSecret}
              onChange={(value) => handleWechatFormChange("appSecret", value)}
              type="password"
            />
            <Field label="默认作者" value={wechatForm.defaultAuthor} onChange={(value) => handleWechatFormChange("defaultAuthor", value)} />
            <label className="flex items-center gap-2 text-[12px] text-gray-600">
              <input
                type="checkbox"
                checked={wechatForm.setAsSelected}
                onChange={(event) => handleWechatFormChange("setAsSelected", event.target.checked)}
              />
              保存后设为默认公众号
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveWechatAccount()}
                disabled={wechatLoading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                style={{ fontWeight: 500 }}
              >
                {wechatForm.id ? "保存账号" : "添加账号"}
              </button>
              {wechatForm.id ? (
                <button
                  type="button"
                  onClick={resetWechatForm}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-600 hover:bg-gray-50"
                  style={{ fontWeight: 500 }}
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      <Section title="内容偏好标签">
        <TagEditor label="你偏好生成的内容形式" values={form.contentPreferences} color="purple" onChange={(values) => updateField("contentPreferences", values)} />
      </Section>

      <div className="flex justify-end text-[12px] text-gray-400">
        {isDirty ? "你有未保存的修改" : "当前设置已同步到云端"}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-[14px] mb-4 pb-3 border-b border-gray-50" style={{ fontWeight: 600 }}>{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white transition-colors"
      />
    </div>
  );
}

function TagEditor({
  label,
  values,
  color,
  onChange,
}: {
  label: string;
  values: string[];
  color: "blue" | "green" | "red" | "purple";
  onChange: (values: string[]) => void;
}) {
  const [draftValue, setDraftValue] = useState("");

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 hover:text-blue-800 hover:border-blue-300",
    green: "bg-green-50 text-green-600 hover:text-green-800 hover:border-green-300",
    red: "bg-red-50 text-red-500 hover:text-red-700 hover:border-red-300",
    purple: "bg-purple-50 text-purple-600 hover:text-purple-800 hover:border-purple-300",
  };

  const addTag = () => {
    const trimmedValue = draftValue.trim();
    if (!trimmedValue || values.includes(trimmedValue)) return;
    onChange([...values, trimmedValue]);
    setDraftValue("");
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((value) => (
          <span key={value} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] ${colorClasses[color]}`} style={{ fontWeight: 500 }}>
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))}>
              <X className="w-3 h-3 cursor-pointer" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white transition-colors"
          placeholder="输入后回车添加"
        />
        <button
          type="button"
          onClick={addTag}
          className="flex items-center gap-1 border border-dashed border-gray-300 px-2.5 py-2 rounded-full text-[12px] text-gray-400 hover:text-gray-700"
        >
          <Plus className="w-3 h-3" /> 添加
        </button>
      </div>
    </div>
  );
}

function DomainSelector({
  label,
  values,
  onChange,
}: {
  label: string;
  values: ArticleDomain[];
  onChange: (values: ArticleDomain[]) => void;
}) {
  const toggleDomain = (domain: ArticleDomain) => {
    if (values.includes(domain)) {
      if (values.length === 1) return;
      onChange(values.filter((item) => item !== domain));
      return;
    }

    onChange([...values, domain]);
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {articleDomains.map((domain) => {
          const active = values.includes(domain);
          return (
            <button
              key={domain}
              type="button"
              onClick={() => toggleDomain(domain)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                active
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 text-[13px]" style={{ fontWeight: 600 }}>
                <span>{domainConfigs[domain].icon}</span>
                <span className={active ? "text-blue-700" : "text-gray-800"}>{domain}</span>
              </div>
              <div className="mt-1 text-[11px] leading-5 text-gray-500">{domainConfigs[domain].description}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-gray-400">至少保留 1 个领域，写作页会基于这里展示可选范围。</div>
    </div>
  );
}
