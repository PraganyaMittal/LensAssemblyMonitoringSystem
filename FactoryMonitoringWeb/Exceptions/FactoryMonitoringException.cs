using System;

namespace FactoryMonitoringWeb.Exceptions
{
    /// <summary>
    /// Base exception for all Factory Monitoring domain exceptions.
    /// Provides structured error information with correlation ID for distributed tracing.
    /// 
    /// Design Decision: Abstract base class instead of interface because:
    /// 1. Exceptions must inherit from System.Exception
    /// 2. We want shared behavior (CorrelationId property, message formatting)
    /// 3. LSP compliance: all derived exceptions can substitute for base
    /// </summary>
    public abstract class FactoryMonitoringException : Exception
    {
        /// <summary>
        /// Machine-readable error code for client-side error handling.
        /// Format: DOMAIN_SPECIFIC_CODE (e.g., "AGENT_NOT_FOUND", "REGISTRATION_FAILED")
        /// </summary>
        public string ErrorCode { get; }

        /// <summary>
        /// Correlation ID for distributed tracing across services.
        /// Injected from HTTP request header or generated if missing.
        /// </summary>
        public string? CorrelationId { get; }

        /// <summary>
        /// UTC timestamp when the exception occurred.
        /// </summary>
        public DateTime OccurredAt { get; }

        protected FactoryMonitoringException(
            string errorCode,
            string message,
            string? correlationId = null,
            Exception? innerException = null)
            : base(message, innerException)
        {
            ErrorCode = errorCode ?? throw new ArgumentNullException(nameof(errorCode));
            CorrelationId = correlationId;
            OccurredAt = DateTime.UtcNow;
        }

        /// <summary>
        /// Returns structured error information for logging and API responses.
        /// </summary>
        public virtual object ToErrorResponse()
        {
            return new
            {
                ErrorCode,
                Message,
                CorrelationId,
                Timestamp = OccurredAt.ToString("o")
            };
        }
    }

    /// <summary>
    /// Thrown when an agent/PC cannot be found by the specified identifier.
    /// HTTP Status: 404 Not Found
    /// </summary>
    public class AgentNotFoundException : FactoryMonitoringException
    {
        public int PCId { get; }

        public AgentNotFoundException(int pcId, string? correlationId = null)
            : base(
                errorCode: "AGENT_NOT_FOUND",
                message: $"Agent with PC ID {pcId} was not found",
                correlationId: correlationId)
        {
            PCId = pcId;
        }

        public override object ToErrorResponse()
        {
            return new
            {
                ErrorCode,
                Message,
                CorrelationId,
                Timestamp = OccurredAt.ToString("o"),
                PCId
            };
        }
    }

    /// <summary>
    /// Thrown when agent registration fails due to business rule violations.
    /// HTTP Status: 400 Bad Request or 409 Conflict
    /// </summary>
    public class RegistrationFailedException : FactoryMonitoringException
    {
        public int LineNumber { get; }
        public int PCNumber { get; }
        public string? ModelVersion { get; }

        public RegistrationFailedException(
            int lineNumber,
            int pcNumber,
            string? modelVersion,
            string reason,
            string? correlationId = null,
            Exception? innerException = null)
            : base(
                errorCode: "REGISTRATION_FAILED",
                message: $"Failed to register agent for Line {lineNumber}, PC {pcNumber}: {reason}",
                correlationId: correlationId,
                innerException: innerException)
        {
            LineNumber = lineNumber;
            PCNumber = pcNumber;
            ModelVersion = modelVersion;
        }

        public override object ToErrorResponse()
        {
            return new
            {
                ErrorCode,
                Message,
                CorrelationId,
                Timestamp = OccurredAt.ToString("o"),
                LineNumber,
                PCNumber,
                ModelVersion
            };
        }
    }

    /// <summary>
    /// Thrown when a command cannot be executed due to invalid state or data.
    /// HTTP Status: 400 Bad Request or 500 Internal Server Error
    /// </summary>
    public class CommandExecutionException : FactoryMonitoringException
    {
        public int? CommandId { get; }
        public string? CommandType { get; }

        public CommandExecutionException(
            int? commandId,
            string? commandType,
            string reason,
            string? correlationId = null,
            Exception? innerException = null)
            : base(
                errorCode: "COMMAND_EXECUTION_FAILED",
                message: $"Command execution failed{(commandId.HasValue ? $" (ID: {commandId})" : "")}: {reason}",
                correlationId: correlationId,
                innerException: innerException)
        {
            CommandId = commandId;
            CommandType = commandType;
        }
    }

    /// <summary>
    /// Thrown when input validation fails.
    /// HTTP Status: 400 Bad Request
    /// </summary>
    public class DomainValidationException : FactoryMonitoringException
    {
        public IDictionary<string, string[]> ValidationErrors { get; }

        public DomainValidationException(
            IDictionary<string, string[]> validationErrors,
            string? correlationId = null)
            : base(
                errorCode: "VALIDATION_FAILED",
                message: "One or more validation errors occurred",
                correlationId: correlationId)
        {
            ValidationErrors = validationErrors ?? new Dictionary<string, string[]>();
        }

        public DomainValidationException(
            string fieldName,
            string errorMessage,
            string? correlationId = null)
            : this(
                new Dictionary<string, string[]> { { fieldName, new[] { errorMessage } } },
                correlationId)
        {
        }

        public override object ToErrorResponse()
        {
            return new
            {
                ErrorCode,
                Message,
                CorrelationId,
                Timestamp = OccurredAt.ToString("o"),
                Errors = ValidationErrors
            };
        }
    }

    /// <summary>
    /// Thrown when a repository operation fails.
    /// HTTP Status: 500 Internal Server Error
    /// </summary>
    public class RepositoryException : FactoryMonitoringException
    {
        public string EntityType { get; }
        public string Operation { get; }

        public RepositoryException(
            string entityType,
            string operation,
            string reason,
            string? correlationId = null,
            Exception? innerException = null)
            : base(
                errorCode: "REPOSITORY_ERROR",
                message: $"Repository operation '{operation}' failed for {entityType}: {reason}",
                correlationId: correlationId,
                innerException: innerException)
        {
            EntityType = entityType;
            Operation = operation;
        }
    }
}
