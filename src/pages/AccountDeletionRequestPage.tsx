import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountDeletionRequestPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    reason: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.reason.trim()) {
      newErrors.reason = "Reason for deletion is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // For demo purposes, we'll just show success
      console.log("Account deletion request submitted:", formData);
      setIsSubmitted(true);
    } catch (error) {
      console.error("Error submitting request:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewRequest = () => {
    setIsSubmitted(false);
    setFormData({ name: "", email: "", reason: "" });
    setErrors({});
  };

  if (isSubmitted) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-green-600">
              Request Submitted Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
              <div className="mb-4">
                <svg
                  className="mx-auto h-16 w-16 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-emerald-800 mb-2">
                Account Deletion Request Received
              </h3>
              <p className="text-sm text-emerald-700 mb-4">
                We have received your account deletion request for <strong>{formData.email}</strong>.
                Our team will review your request and process it within 5-7 business days.
              </p>
              <p className="text-xs text-emerald-600">
                You will receive a confirmation email once your account has been deleted.
              </p>
            </div>
            
            <div className="pt-4">
              <Button onClick={handleNewRequest} variant="outline">
                Submit Another Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Account Deletion Request</CardTitle>
          <p className="text-sm text-muted-foreground">
            Please fill out this form to request the deletion of your account. 
            This action cannot be undone and all your data will be permanently removed.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className={errors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
                disabled={isSubmitting}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Deletion</Label>
              <textarea
                id="reason"
                placeholder="Please explain why you want to delete your account..."
                value={formData.reason}
                onChange={(e) => handleInputChange("reason", e.target.value)}
                className={`flex min-h-[120px] w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-none ${
                  errors.reason 
                    ? "border-red-500 focus-visible:ring-red-500" 
                    : "border-border bg-background focus-visible:ring-[hsl(var(--primary))]"
                }`}
                disabled={isSubmitting}
              />
              {errors.reason && (
                <p className="text-sm text-red-600">{errors.reason}</p>
              )}
            </div>

            <div className="rounded-md border border-orange-300 bg-orange-50 p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-orange-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-orange-800">
                    Important Notice
                  </h3>
                  <div className="mt-2 text-sm text-orange-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li>This action is irreversible and will permanently delete all your data</li>
                      <li>You will lose access to all associated services and content</li>
                      <li>Account deletion requests are processed within 5-7 business days</li>
                      <li>You will receive a confirmation email once the deletion is complete</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting Request..." : "Submit Deletion Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
