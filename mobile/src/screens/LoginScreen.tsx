// Login screen — simple email + password sign in
//
// For MVP, just a basic form. No fancy onboarding yet.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { signIn, signUp } from "../services/auth";

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      onLogin();
    } catch (e: any) {
      Alert.alert("Sign in failed", e.message || "Please try again");
    }
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      Alert.alert("Success", "Account created! You can now sign in.");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message || "Please try again");
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙️ Backyard</Text>
      <Text style={styles.subtitle}>Every street has a story</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" color="#4A90D9" style={{ margin: 20 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
            <Text style={styles.signInText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpBtn} onPress={handleSignUp}>
            <Text style={styles.signUpText}>Create Account</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
    justifyContent: "center",
    padding: 30,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginBottom: 40,
  },
  input: {
    backgroundColor: "#1a1a2e",
    color: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  signInBtn: {
    backgroundColor: "#4A90D9",
    padding: 16,
    borderRadius: 10,
    marginTop: 8,
  },
  signInText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  signUpBtn: {
    padding: 16,
    marginTop: 8,
  },
  signUpText: {
    color: "#4A90D9",
    textAlign: "center",
    fontSize: 16,
  },
});
