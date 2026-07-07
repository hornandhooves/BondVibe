/**
 * E2 — Kinlo Pro checkout (host). Opens Stripe hosted Checkout (existing flow);
 * the webhook flips users/{uid}.isPremium on success.
 */
import React, { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import SubscriptionCheckoutView from "./SubscriptionCheckoutView";
import { startProCheckout } from "../../services/proService";
import { getSubscriptionConfig, SUBSCRIPTION_DEFAULTS } from "../../services/configService";

export default function ProCheckoutScreen({ navigation }) {
  const { t } = useTranslation();
  const [pro, setPro] = useState(SUBSCRIPTION_DEFAULTS.pro);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSubscriptionConfig().then((c) => setPro(c.pro));
  }, []);

  const onSubscribe = async () => {
    setLoading(true);
    try {
      await startProCheckout();
    } catch (e) {
      Alert.alert(t("matching.checkout.errorTitle"), e.message || t("matching.checkout.tryAgain"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SubscriptionCheckoutView
      title="Kinlo Pro"
      planName="Kinlo Pro"
      amount={pro.amount}
      currency={pro.currency}
      interval={pro.interval}
      note={t("matching.checkout.proNote")}
      loading={loading}
      onSubscribe={onSubscribe}
      onBack={() => navigation.goBack()}
    />
  );
}
