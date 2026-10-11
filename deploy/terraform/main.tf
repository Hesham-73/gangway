resource "aws_ecr_repository" "api" {
  name                 = "gangway"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/gangway/api"
  retention_in_days = 14
}
