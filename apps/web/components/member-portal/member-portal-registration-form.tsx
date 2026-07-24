"use client";

import { useId } from "react";
import {
  ArrowRight,
  CalendarDays,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Phone,
  UserRound,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import styles from "./member-portal-auth.module.css";
import { MemberPortalFieldError } from "./member-portal-field-error";
import { MemberPortalFormErrorSlot } from "./member-portal-form-error-slot";
import { MemberPortalPasswordField } from "./member-portal-password-field";
import type { MemberPortalRegistrationOptions } from "./types";
import { useMemberPortalFormSubmission } from "./use-member-portal-form-submission";

interface MemberPortalRegistrationFormProps extends MemberPortalRegistrationOptions {
  congregationName: string;
  onLogin: () => void;
}

export function MemberPortalRegistrationForm({
  congregationName,
  defaultValues,
  errors,
  isPending: isExternallyPending = false,
  onSubmit,
  onLogin,
}: MemberPortalRegistrationFormProps) {
  const formId = useId();
  const { handleSubmit, isPending } = useMemberPortalFormSubmission(onSubmit);
  const pending = isExternallyPending || isPending;

  const ids = {
    fullName: `${formId}-registration-full-name`,
    email: `${formId}-registration-email`,
    phone: `${formId}-registration-phone`,
    birthDate: `${formId}-registration-birth-date`,
    applicantMessage: `${formId}-registration-applicant-message`,
    password: `${formId}-registration-password`,
    passwordConfirmation: `${formId}-registration-password-confirmation`,
    privacyConsent: `${formId}-registration-privacy-consent`,
  };

  return (
    <div className={styles.panelBody}>
      <div className={styles.panelHeading}>
        <p className={styles.panelEyebrow}>Csatlakozási kérelem</p>
        <h1 id="member-portal-registration-heading">
          Hozza létre tagi fiókját
        </h1>
        <p>
          A regisztráció kizárólag a(z) <strong>{congregationName}</strong>{" "}
          közösségéhez kapcsolódik.
        </p>
      </div>

      <div className={styles.matchingNotice}>
        <UserRoundCheck aria-hidden="true" />
        <p>
          A megadott adatokat a lelkipásztor ellenőrzi, majd összekapcsolja a
          gyülekezeti nyilvántartás megfelelő személyével.
        </p>
      </div>

      <MemberPortalFormErrorSlot message={errors?.form} />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.registrationGrid}>
          <div className={cn(styles.fieldGroup, styles.fullWidthField)}>
            <Label htmlFor={ids.fullName} className={styles.fieldLabel}>
              Teljes név
            </Label>
            <div className={styles.inputWithAction}>
              <UserRound className={styles.inputIcon} aria-hidden="true" />
              <Input
                id={ids.fullName}
                name="fullName"
                type="text"
                autoComplete="name"
                defaultValue={defaultValues?.fullName}
                placeholder="Ahogyan a nyilvántartásban szerepel"
                required
                aria-invalid={Boolean(errors?.fullName)}
                aria-describedby={
                  errors?.fullName ? `${ids.fullName}-error` : undefined
                }
                className={cn(styles.input, styles.inputWithLeadingIcon)}
              />
            </div>
            <MemberPortalFieldError
              id={`${ids.fullName}-error`}
              message={errors?.fullName}
            />
          </div>

          <div className={cn(styles.fieldGroup, styles.fullWidthField)}>
            <Label htmlFor={ids.email} className={styles.fieldLabel}>
              E-mail-cím
            </Label>
            <div className={styles.inputWithAction}>
              <Mail className={styles.inputIcon} aria-hidden="true" />
              <Input
                id={ids.email}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue={defaultValues?.email}
                placeholder="nev@pelda.hu"
                required
                spellCheck={false}
                aria-invalid={Boolean(errors?.email)}
                aria-describedby={
                  errors?.email ? `${ids.email}-error` : undefined
                }
                className={cn(styles.input, styles.inputWithLeadingIcon)}
              />
            </div>
            <MemberPortalFieldError
              id={`${ids.email}-error`}
              message={errors?.email}
            />
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor={ids.phone} className={styles.fieldLabel}>
              Telefonszám{" "}
              <span className={styles.optionalLabel}>(nem kötelező)</span>
            </Label>
            <div className={styles.inputWithAction}>
              <Phone className={styles.inputIcon} aria-hidden="true" />
              <Input
                id={ids.phone}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={defaultValues?.phone}
                placeholder="+40 7xx xxx xxx"
                aria-invalid={Boolean(errors?.phone)}
                aria-describedby={
                  errors?.phone ? `${ids.phone}-error` : undefined
                }
                className={cn(styles.input, styles.inputWithLeadingIcon)}
              />
            </div>
            <MemberPortalFieldError
              id={`${ids.phone}-error`}
              message={errors?.phone}
            />
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor={ids.birthDate} className={styles.fieldLabel}>
              Születési dátum
            </Label>
            <div className={styles.inputWithAction}>
              <CalendarDays className={styles.inputIcon} aria-hidden="true" />
              <Input
                id={ids.birthDate}
                name="birthDate"
                type="date"
                autoComplete="bday"
                defaultValue={defaultValues?.birthDate}
                required
                aria-invalid={Boolean(errors?.birthDate)}
                aria-describedby={
                  errors?.birthDate ? `${ids.birthDate}-error` : undefined
                }
                className={cn(styles.input, styles.inputWithLeadingIcon)}
              />
            </div>
            <MemberPortalFieldError
              id={`${ids.birthDate}-error`}
              message={errors?.birthDate}
            />
          </div>

          <div className={cn(styles.fieldGroup, styles.fullWidthField)}>
            <Label htmlFor={ids.applicantMessage} className={styles.fieldLabel}>
              Üzenet a lelkipásztornak{" "}
              <span className={styles.optionalLabel}>(nem kötelező)</span>
            </Label>
            <div className={styles.textareaWithIcon}>
              <MessageSquareText
                className={styles.textareaIcon}
                aria-hidden="true"
              />
              <Textarea
                id={ids.applicantMessage}
                name="applicantMessage"
                defaultValue={defaultValues?.applicantMessage}
                placeholder="Például korábbi név vagy más adat, amely segíti az azonosítást"
                maxLength={2000}
                aria-invalid={Boolean(errors?.applicantMessage)}
                aria-describedby={`${ids.applicantMessage}-hint${
                  errors?.applicantMessage
                    ? ` ${ids.applicantMessage}-error`
                    : ""
                }`}
                className={cn(styles.input, styles.textarea)}
              />
            </div>
            <p id={`${ids.applicantMessage}-hint`} className={styles.fieldHint}>
              Ne írjon ide különleges vagy pénzügyi adatot. Legfeljebb 2000
              karakter.
            </p>
            <MemberPortalFieldError
              id={`${ids.applicantMessage}-error`}
              message={errors?.applicantMessage}
            />
          </div>

          <div className={cn(styles.fullWidthField, styles.passwordGrid)}>
            <MemberPortalPasswordField
              id={ids.password}
              name="password"
              label="Jelszó"
              autoComplete="new-password"
              hint="Legalább 8 karakter; használjon egyedi, máshol nem alkalmazott jelszót."
              hintId={`${ids.password}-hint`}
              error={errors?.password}
              errorId={`${ids.password}-error`}
            />
            <MemberPortalPasswordField
              id={ids.passwordConfirmation}
              name="passwordConfirmation"
              label="Jelszó ismét"
              autoComplete="new-password"
              error={errors?.passwordConfirmation}
              errorId={`${ids.passwordConfirmation}-error`}
            />
          </div>

          <div className={cn(styles.fieldGroup, styles.fullWidthField)}>
            <label
              htmlFor={ids.privacyConsent}
              className={cn(styles.checkboxLabel, styles.consentLabel)}
            >
              <input
                id={ids.privacyConsent}
                type="checkbox"
                name="privacyConsent"
                value="accepted"
                required
                aria-invalid={Boolean(errors?.privacyConsent)}
                aria-describedby={`${ids.privacyConsent}-hint${
                  errors?.privacyConsent ? ` ${ids.privacyConsent}-error` : ""
                }`}
              />
              <span>
                Elfogadom az adatkezelési feltételeket, és hozzájárulok, hogy a
                lelkipásztor a csatlakozási kérelmemet ellenőrizze, majd a
                gyülekezeti nyilvántartás adataival összevesse.
              </span>
            </label>
            <p id={`${ids.privacyConsent}-hint`} className={styles.fieldHint}>
              A fiók jóváhagyásig nem fér hozzá személyes gyülekezeti adatokhoz.
            </p>
            <MemberPortalFieldError
              id={`${ids.privacyConsent}-error`}
              message={errors?.privacyConsent}
            />
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className={styles.primaryAction}
          disabled={pending}
        >
          {pending ? (
            <>
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
              Kérelem küldése…
            </>
          ) : (
            <>
              Regisztráció és kérelem küldése
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <div className={styles.switchPrompt}>
        <span>Már rendelkezik jóváhagyott fiókkal?</span>
        <button type="button" className={styles.textButton} onClick={onLogin}>
          Vissza a belépéshez
        </button>
      </div>
    </div>
  );
}
