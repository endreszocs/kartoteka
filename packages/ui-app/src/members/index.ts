/**
 * members/ — közös tagnyilvántartás-komponensek (D-hullám, 2026-06-11).
 * Web és desktop ugyanazokat a darabokat rendereli (pixel-paritás).
 */
export { MemberAvatar, MemberAvatarStack, type MemberAvatarProps } from './MemberAvatar'
export {
  FamilyCardModern,
  type FamilyCardModernData,
  type FamilyCardMember,
  type FamilyCardModernProps,
  type FamilyPaymentStatus,
} from './FamilyCardModern'
export {
  AvatarEditorBody,
  type AvatarEditorBodyProps,
} from './AvatarEditorBody'
export {
  parseSocialProfileUrl,
  graphPictureJsonUrl,
  graphPictureUrl,
  extractOgImage,
  realPictureUrlFromGraphJson,
  avatarStoragePath,
  type ParsedSocialUrl,
  type SocialProvider,
} from './social-avatar'
export {
  buildFamilyCardHtml,
  type FamilyCardPrintData,
  type FamilyCardPrintPerson,
} from './family-card-print'
// 2026-07-24 (PR-8, F9): a választói névjegyzék A4-építője KÖZÖS — a web
// nyomtatási központja és a desktop Választók-oldala ugyanazt a lapozott
// (WYSIWYG .sheet) nyomtatványt állítja elő.
export {
  buildVoterListReport,
  type VoterRow as VoterPrintRow,
  type VoterPrintResult,
} from './voter-reporting'
// 2026-08-01 (PR-19): kanonikus név-formázás előtagokkal (id./ifj./özv./elv.)
// — web és desktop MINDEN név-megjelenítése ezt használja; a `namepattern||nev`
// minta tilos (előtagot mutatna név helyett).
export {
  formatNameWithPrefix,
  isPrefixLikeNamepattern,
  isOzvegyAllapot,
  type NameWithPrefixInput,
} from './name-format'
