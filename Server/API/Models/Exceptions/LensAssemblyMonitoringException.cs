using System;

namespace LensAssemblyMonitoringWeb.Models.Exceptions
{

    public abstract class LensAssemblyMonitoringException : Exception
    {
        public string ErrorCode { get; }
        public string? CorrelationId { get; }
        public DateTime OccurredAt { get; }

        protected LensAssemblyMonitoringException(
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

    public class AgentNotFoundException : LensAssemblyMonitoringException
    {
        public int MCId { get; }

        public AgentNotFoundException(int mcId, string? correlationId = null)
            : base(
                errorCode: "AGENT_NOT_FOUND",
                message: $"Agent with MC ID {mcId} was not found",
                correlationId: correlationId)
        {
            MCId = mcId;
        }

        public override object ToErrorResponse()
        {
            return new
            {
                ErrorCode,
                Message,
                CorrelationId,
                Timestamp = OccurredAt.ToString("o"),
                MCId
            };
        }
    }

    public class RegistrationFailedException : LensAssemblyMonitoringException
    {
        public int LineNumber { get; }
        public int MCNumber { get; }
        public string? ModelVersion { get; }

        public RegistrationFailedException(
            int lineNumber,
            int mcNumber,
            string? modelVersion,
            string reason,
            string? correlationId = null,
            Exception? innerException = null)
            : base(
                errorCode: "REGISTRATION_FAILED",
                message: $"Failed to register agent for Line {lineNumber}, MC {mcNumber}: {reason}",
                correlationId: correlationId,
                innerException: innerException)
        {
            LineNumber = lineNumber;
            MCNumber = mcNumber;
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
                MCNumber,
                ModelVersion
            };
        }
    }

    public class CommandExecutionException : LensAssemblyMonitoringException
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

    public class DomainValidationException : LensAssemblyMonitoringException
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

    public class RepositoryException : LensAssemblyMonitoringException
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

