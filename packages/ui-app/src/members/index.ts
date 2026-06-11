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
