/**
 * Auth API Service
 *
 * Authentication endpoints for login, register, password reset
 */

import apiClient from './client';
import type { ApiResponse } from '@/types';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    userId: string;
    username: string;
    email: string;
    fullName: string;
  };
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterResponse {
  userId: string;
  username: string;
  email: string;
  message: string;
}

/**
 * Login user
 */
export async function login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  const response = await apiClient.post('/auth/login', data);
  return response.data;
}

/**
 * Register new user
 */
export async function register(data: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
  const response = await apiClient.post('/auth/register', data);
  return response.data;
}

/**
 * Logout user
 */
export async function logout(): Promise<ApiResponse<void>> {
  const response = await apiClient.post('/auth/logout');
  return response.data;
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshToken: string): Promise<ApiResponse<LoginResponse>> {
  const response = await apiClient.post('/auth/refresh', { refreshToken });
  return response.data;
}

/**
 * Reset password with code
 * Uses /users/profile/resetPassword endpoint
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<ApiResponse<{ message: string }>> {
  const response = await apiClient.post('/users/profile/resetPassword', {
    email,
    code,
    newPassword,
  });
  return response.data;
}

/**
 * Verify email with code
 */
export async function verifyEmail(
  username: string,
  code: string
): Promise<ApiResponse<{ message: string }>> {
  const response = await apiClient.post('/auth/verify-email', {
    username,
    code,
  });
  return response.data;
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(
  username: string
): Promise<ApiResponse<{ message: string }>> {
  const response = await apiClient.post('/auth/resend-code', { username });
  return response.data;
}
