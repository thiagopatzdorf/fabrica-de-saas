import type { ChannelId } from "./channels";

/**
 * OAuth real dos marketplaces — isolado do mock.
 * O MVP não chama este módulo. Para ligar um canal de verdade, troque
 * `connectAccount` em db.server.ts por `oauthStart` + o callback do canal.
 *
 * Mercado Livre
 *   authorize: https://auth.mercadolivre.com.br/authorization
 *   token:     https://api.mercadolibre.com/oauth/token
 *   grant:     authorization_code, depois refresh_token
 *
 * Shopee
 *   partner auth v2: /api/v2/shop/auth_partner
 *
 * Amazon
 *   Login with Amazon (LWA) + Selling Partner API
 *
 * Magalu
 *   OAuth2 do marketplace, authorization code
 *
 * Loja própria
 *   token de API emitido na vitrine, sem OAuth de marketplace
 */
export type OAuthStart = {
  channel: ChannelId;
  authorizeUrl: string;
  callbackPath: string;
};

export function oauthStart(_channel: ChannelId): OAuthStart {
  throw new Error("OAuth real está isolado e desligado. Os conectores usam o adapter mock.");
}
